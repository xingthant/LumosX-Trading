import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { pool, withTransaction } from '../db';
import { getBalances, lockFunds, InsufficientBalanceError } from '../services/ledger';
import { verifyWithdrawalPassword, WithdrawalPasswordError } from '../services/security';

const router = Router();
router.use(requireAuth);

router.get('/balances', async (req, res) => {
  const balances = await getBalances(req.user!.id);
  res.json({ balances });
});

// Active bank accounts users can send deposits to, as configured by admins.
router.get('/deposit-banks', async (_req, res) => {
  const result = await pool.query(
    `SELECT id, bank_name, account_holder, account_number, iban, swift_code, currency, instructions
     FROM deposit_banks WHERE is_active = true ORDER BY created_at DESC`
  );
  res.json({ banks: result.rows });
});

// --- The user's own bound payout methods (crypto wallet address or bank account) --------

const MAX_BANK_ACCOUNTS_PER_USER = 7;

const paymentMethodSchema = z.object({
  type: z.enum(['CRYPTO_WALLET', 'BANK_ACCOUNT']),
  label: z.string().min(1).max(100),
  assetSymbol: z.string().max(20).optional(),
  walletAddress: z.string().max(255).optional(),
  network: z.string().max(50).optional(),
  bankName: z.string().max(255).optional(),
  accountHolder: z.string().max(255).optional(),
  accountNumber: z.string().max(100).optional(),
  iban: z.string().max(100).optional(),
  swiftCode: z.string().max(50).optional(),
  note: z.string().max(500).optional(),
});

router.get('/payment-methods', async (req, res) => {
  const result = await pool.query(`SELECT * FROM user_payment_methods WHERE user_id = $1 ORDER BY created_at DESC`, [req.user!.id]);
  res.json({ methods: result.rows });
});

router.post('/payment-methods', async (req, res) => {
  const parsed = paymentMethodSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = parsed.data;

  if (m.type === 'CRYPTO_WALLET' && (!m.assetSymbol || !m.walletAddress)) {
    return res.status(400).json({ error: 'assetSymbol and walletAddress are required for a crypto wallet' });
  }
  if (m.type === 'BANK_ACCOUNT' && (!m.bankName || !m.accountHolder || !m.accountNumber)) {
    return res.status(400).json({ error: 'bankName, accountHolder and accountNumber are required for a bank account' });
  }

  if (m.type === 'BANK_ACCOUNT') {
    const countRes = await pool.query(
      `SELECT count(*) FROM user_payment_methods WHERE user_id = $1 AND type = 'BANK_ACCOUNT'`,
      [req.user!.id]
    );
    if (parseInt(countRes.rows[0].count, 10) >= MAX_BANK_ACCOUNTS_PER_USER) {
      return res.status(400).json({ error: `You can save at most ${MAX_BANK_ACCOUNTS_PER_USER} bank accounts` });
    }
  }

  const result = await pool.query(
    `INSERT INTO user_payment_methods
       (user_id, type, label, asset_symbol, wallet_address, network, bank_name, account_holder, account_number, iban, swift_code, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [
      req.user!.id,
      m.type,
      m.label,
      m.assetSymbol?.toUpperCase() || null,
      m.walletAddress || null,
      m.network || null,
      m.bankName || null,
      m.accountHolder || null,
      m.accountNumber || null,
      m.iban || null,
      m.swiftCode || null,
      m.note || null,
    ]
  );
  res.status(201).json({ method: result.rows[0] });
});

router.delete('/payment-methods/:id', async (req, res) => {
  const result = await pool.query(
    `DELETE FROM user_payment_methods WHERE id = $1 AND user_id = $2 RETURNING id`,
    [req.params.id, req.user!.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Payment method not found' });
  res.json({ ok: true });
});

const txSchema = z.object({
  assetSymbol: z.string().min(2),
  amount: z.number().positive(),
  reason: z.string().max(500).optional(),
});

// Deposit requests are queued for admin approval before crediting available_balance.
router.post('/deposit', async (req, res) => {
  const parsed = txSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { assetSymbol, amount, reason } = parsed.data;

  const result = await pool.query(
    `INSERT INTO transactions (user_id, type, asset_symbol, amount, status, reason)
     VALUES ($1, 'DEPOSIT', $2, $3, 'PENDING', $4) RETURNING *`,
    [req.user!.id, assetSymbol.toUpperCase(), amount, reason || null]
  );
  res.status(201).json({ transaction: result.rows[0] });
});

const withdrawSchema = txSchema.extend({
  paymentMethodId: z.string().uuid(),
  withdrawalPassword: z.string().min(1),
});

// Withdrawal requests lock funds immediately; admin approval finalizes the deduction.
// Requires the user's separate withdrawal password and a payout method they've already bound.
router.post('/withdraw', async (req, res) => {
  const parsed = withdrawSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { assetSymbol, amount, reason, paymentMethodId, withdrawalPassword } = parsed.data;
  const asset = assetSymbol.toUpperCase();

  try {
    await verifyWithdrawalPassword(req.user!.id, withdrawalPassword);

    const method = await pool.query(`SELECT id FROM user_payment_methods WHERE id = $1 AND user_id = $2`, [
      paymentMethodId,
      req.user!.id,
    ]);
    if (method.rowCount === 0) return res.status(400).json({ error: 'Payout method not found' });

    const transaction = await withTransaction(async (client) => {
      await lockFunds(client, req.user!.id, asset, amount);
      const txRes = await client.query(
        `INSERT INTO transactions (user_id, type, asset_symbol, amount, status, reason, payment_method_id)
         VALUES ($1, 'WITHDRAWAL', $2, $3, 'PENDING', $4, $5) RETURNING *`,
        [req.user!.id, asset, amount, reason || null, paymentMethodId]
      );
      return txRes.rows[0];
    });
    res.status(201).json({ transaction });
  } catch (err) {
    if (err instanceof InsufficientBalanceError || err instanceof WithdrawalPasswordError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[wallet] withdrawal request failed', err);
    res.status(500).json({ error: 'Failed to submit withdrawal request' });
  }
});

router.get('/transactions', async (req, res) => {
  const result = await pool.query(
    `SELECT t.*, m.label AS payment_method_label
     FROM transactions t LEFT JOIN user_payment_methods m ON m.id = t.payment_method_id
     WHERE t.user_id = $1 ORDER BY t.created_at DESC LIMIT 200`,
    [req.user!.id]
  );
  res.json({ transactions: result.rows });
});

export default router;
