import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { pool, withTransaction } from '../db';
import { creditAvailable, debitAvailable, deductLocked, unlockFunds, InsufficientBalanceError } from '../services/ledger';
import { redis, redisPub, CHANNELS, overridePriceKey } from '../redis';
import { resolvePrice } from '../services/priceResolver';
import { config } from '../config';
import { generateReferralCode, applyRegistrationBonus, applyReferralBonus } from '../services/bonus';

const router = Router();
router.use(requireAuth, requireAdmin);

async function logAudit(
  adminId: string,
  actionType: string,
  opts: { targetUserId?: string; amount?: number; assetSymbol?: string; metadata?: object } = {}
) {
  await pool.query(
    `INSERT INTO admin_audit_logs (admin_id, target_user_id, action_type, amount, asset_symbol, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [adminId, opts.targetUserId || null, actionType, opts.amount ?? null, opts.assetSymbol || null, opts.metadata ? JSON.stringify(opts.metadata) : null]
  );
}

// --- Users & balances ---------------------------------------------------

router.get('/users', async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim();
  const params: any[] = [];
  let where = '';
  if (search) {
    params.push(`%${search}%`);
    where = `WHERE u.email ILIKE $${params.length}`;
  }

  const result = await pool.query(
    `SELECT u.id, u.email, u.role, u.is_merchant, u.is_frozen, u.created_at,
            COALESCE(json_agg(json_build_object('asset', b.asset_symbol, 'available', b.available_balance, 'locked', b.locked_balance))
                     FILTER (WHERE b.id IS NOT NULL), '[]') AS balances
     FROM users u
     LEFT JOIN user_balances b ON b.user_id = u.id
     ${where}
     GROUP BY u.id ORDER BY u.created_at DESC`,
    params
  );
  res.json({ users: result.rows });
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['USER', 'ADMIN']).default('USER'),
  referralCode: z.string().max(20).optional(),
});

// Mirrors the public /api/auth/register flow (starting balance, referral code generation,
// registration bonus, referral redemption) so an admin-created account behaves identically
// to a self-registered one instead of silently skipping those steps.
router.post('/users', async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, role, referralCode } = parsed.data;

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount && existing.rowCount > 0) return res.status(409).json({ error: 'Email already registered' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await withTransaction(async (client) => {
    const userRes = await client.query(
      `INSERT INTO users (email, password_hash, role, referral_code) VALUES ($1, $2, $3, $4) RETURNING id, email, role, is_frozen, created_at`,
      [email, passwordHash, role, generateReferralCode()]
    );
    const newUser = userRes.rows[0];

    await client.query(
      `INSERT INTO user_balances (user_id, asset_symbol, available_balance, locked_balance) VALUES ($1, $2, $3, 0)`,
      [newUser.id, config.fiatSymbol, config.startingFiatBalance]
    );

    await applyRegistrationBonus(client, newUser.id);

    if (referralCode) {
      const referrerRes = await client.query('SELECT id FROM users WHERE referral_code = $1', [referralCode.toUpperCase()]);
      const referrer = referrerRes.rows[0];
      if (referrer && referrer.id !== newUser.id) {
        const cfg = await applyReferralBonus(client, referrer.id, newUser.id);
        await client.query(
          `INSERT INTO referrals (referrer_id, referred_user_id, referrer_bonus_amount, referee_bonus_amount, asset_symbol)
           VALUES ($1, $2, $3, $4, $5)`,
          [referrer.id, newUser.id, cfg?.referrer_bonus_amount ?? null, cfg?.referee_bonus_amount ?? null, cfg?.asset_symbol ?? null]
        );
      }
    }

    return newUser;
  });

  await logAudit(req.user!.id, 'USER_CREATE', { targetUserId: user.id, metadata: { email, role } });
  res.status(201).json({ user });
});

router.patch('/users/:id/status', async (req, res) => {
  const parsed = z.object({ isFrozen: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const result = await pool.query(
    `UPDATE users SET is_frozen = $2, updated_at = now() WHERE id = $1 RETURNING id, email, is_frozen`,
    [req.params.id, parsed.data.isFrozen]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });

  await logAudit(req.user!.id, parsed.data.isFrozen ? 'USER_FREEZE' : 'USER_UNFREEZE', { targetUserId: req.params.id });
  res.json({ user: result.rows[0] });
});

router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user!.id) return res.status(400).json({ error: 'You cannot delete your own account' });

  try {
    await withTransaction(async (client) => {
      const result = await client.query('DELETE FROM users WHERE id = $1 RETURNING id, email', [req.params.id]);
      if (result.rowCount === 0) throw new Error('NOT_FOUND');

      // target_user_id can't reference the row we just deleted, so record the email in metadata instead.
      await client.query(
        `INSERT INTO admin_audit_logs (admin_id, target_user_id, action_type, metadata_json) VALUES ($1, NULL, 'USER_DELETE', $2)`,
        [req.user!.id, JSON.stringify({ deletedUserId: req.params.id, deletedEmail: result.rows[0].email })]
      );
    });
    res.json({ ok: true });
  } catch (err: any) {
    if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'User not found' });
    if (err.code === '23503') {
      return res
        .status(400)
        .json({ error: 'This user has existing orders, transactions, or history and cannot be deleted. Freeze the account instead.' });
    }
    console.error('[admin] delete user failed', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

const resetPasswordSchema = z.object({ newPassword: z.string().min(8) });

router.post('/users/:id/reset-password', async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const hash = await bcrypt.hash(parsed.data.newPassword, 10);
  const result = await pool.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1 RETURNING id', [
    req.params.id,
    hash,
  ]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });

  await logAudit(req.user!.id, 'USER_PASSWORD_RESET', { targetUserId: req.params.id });
  res.json({ ok: true });
});

const resetWithdrawalPasswordSchema = z.object({ newWithdrawalPassword: z.string().min(6) });

router.post('/users/:id/reset-withdrawal-password', async (req, res) => {
  const parsed = resetWithdrawalPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const hash = await bcrypt.hash(parsed.data.newWithdrawalPassword, 10);
  const result = await pool.query('UPDATE users SET withdrawal_password_hash = $2, updated_at = now() WHERE id = $1 RETURNING id', [
    req.params.id,
    hash,
  ]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });

  await logAudit(req.user!.id, 'USER_WITHDRAWAL_PASSWORD_RESET', { targetUserId: req.params.id });
  res.json({ ok: true });
});

const adjustSchema = z.object({
  userId: z.string().uuid(),
  assetSymbol: z.string().min(2),
  amount: z.number().positive(),
  direction: z.enum(['CREDIT', 'DEBIT']),
  reason: z.string().max(500).optional(),
});

router.patch('/users/:id/merchant', async (req, res) => {
  const parsed = z.object({ isMerchant: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const result = await pool.query(
    `UPDATE users SET is_merchant = $2, updated_at = now() WHERE id = $1 RETURNING id, email, is_merchant`,
    [req.params.id, parsed.data.isMerchant]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });

  await logAudit(req.user!.id, parsed.data.isMerchant ? 'MERCHANT_GRANT' : 'MERCHANT_REVOKE', { targetUserId: req.params.id });
  res.json({ user: result.rows[0] });
});

router.post('/balances/adjust', async (req, res) => {
  const parsed = adjustSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { userId, assetSymbol, amount, direction, reason } = parsed.data;
  const asset = assetSymbol.toUpperCase();

  try {
    await withTransaction(async (client) => {
      if (direction === 'CREDIT') {
        await creditAvailable(client, userId, asset, amount);
      } else {
        await debitAvailable(client, userId, asset, amount);
      }
      await client.query(
        `INSERT INTO admin_audit_logs (admin_id, target_user_id, action_type, amount, asset_symbol, metadata_json)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.user!.id, userId, `BALANCE_${direction}`, amount, asset, reason ? JSON.stringify({ reason }) : null]
      );
    });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[admin] balance adjustment failed', err);
    res.status(500).json({ error: 'Failed to adjust balance' });
  }
});

// --- Deposit / withdrawal approvals --------------------------------------

router.get('/transactions', async (req, res) => {
  const status = (req.query.status as string | undefined)?.toUpperCase();
  const params: any[] = [];
  let query = `SELECT t.*, u.email, m.type AS payment_method_type, m.label AS payment_method_label,
                      m.wallet_address, m.network, m.bank_name, m.account_holder, m.account_number, m.iban, m.swift_code
               FROM transactions t
               JOIN users u ON u.id = t.user_id
               LEFT JOIN user_payment_methods m ON m.id = t.payment_method_id`;
  if (status) {
    params.push(status);
    query += ` WHERE t.status = $1`;
  }
  query += ' ORDER BY t.created_at DESC LIMIT 200';
  const result = await pool.query(query, params);
  res.json({ transactions: result.rows });
});

const manualTxSchema = z.object({
  userId: z.string().uuid(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL']),
  assetSymbol: z.string().min(2),
  amount: z.number().positive(),
  reason: z.string().max(500).optional(),
});

// Manually records a transaction that's already been verified off-platform (e.g. a deposit
// confirmed by other means), applying the balance change immediately as COMPLETED.
router.post('/transactions', async (req, res) => {
  const parsed = manualTxSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { userId, type, assetSymbol, amount, reason } = parsed.data;
  const asset = assetSymbol.toUpperCase();

  try {
    const transaction = await withTransaction(async (client) => {
      if (type === 'DEPOSIT') {
        await creditAvailable(client, userId, asset, amount);
      } else {
        await debitAvailable(client, userId, asset, amount);
      }
      const txRes = await client.query(
        `INSERT INTO transactions (user_id, type, asset_symbol, amount, status, reason, admin_id)
         VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $6) RETURNING *`,
        [userId, type, asset, amount, reason || null, req.user!.id]
      );
      return txRes.rows[0];
    });
    await logAudit(req.user!.id, `TX_MANUAL_${type}`, { targetUserId: userId, amount, assetSymbol: asset, metadata: { txId: transaction.id } });
    res.status(201).json({ transaction });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) return res.status(400).json({ error: err.message });
    console.error('[admin] manual transaction failed', err);
    res.status(500).json({ error: 'Failed to record transaction' });
  }
});

// Deletes a transaction that's still pending (cleanup), releasing any escrowed withdrawal funds.
router.delete('/transactions/:id', async (req, res) => {
  try {
    await withTransaction(async (client) => {
      const txRes = await client.query(`SELECT * FROM transactions WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const transaction = txRes.rows[0];
      if (!transaction) throw new Error('NOT_FOUND');
      if (transaction.status !== 'PENDING') throw new Error('NOT_PENDING');

      if (transaction.type === 'WITHDRAWAL') {
        await unlockFunds(client, transaction.user_id, transaction.asset_symbol, parseFloat(transaction.amount));
      }
      await client.query(`DELETE FROM transactions WHERE id = $1`, [req.params.id]);
    });
    await logAudit(req.user!.id, 'TX_DELETE', { metadata: { txId: req.params.id } });
    res.json({ ok: true });
  } catch (err: any) {
    if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Transaction not found' });
    if (err.message === 'NOT_PENDING') return res.status(400).json({ error: 'Only pending transactions can be deleted' });
    console.error('[admin] delete transaction failed', err);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

router.post('/transactions/:id/approve', async (req, res) => {
  const txId = req.params.id;
  try {
    const tx = await withTransaction(async (client) => {
      const txRes = await client.query(`SELECT * FROM transactions WHERE id = $1 FOR UPDATE`, [txId]);
      const transaction = txRes.rows[0];
      if (!transaction) throw new Error('NOT_FOUND');
      if (transaction.status !== 'PENDING') throw new Error('NOT_PENDING');

      if (transaction.type === 'WITHDRAWAL') {
        await deductLocked(client, transaction.user_id, transaction.asset_symbol, parseFloat(transaction.amount));
      } else if (transaction.type === 'DEPOSIT') {
        await creditAvailable(client, transaction.user_id, transaction.asset_symbol, parseFloat(transaction.amount));
      }

      const updated = await client.query(
        `UPDATE transactions SET status = 'COMPLETED', admin_id = $2, updated_at = now() WHERE id = $1 RETURNING *`,
        [txId, req.user!.id]
      );
      await client.query(
        `INSERT INTO admin_audit_logs (admin_id, target_user_id, action_type, amount, asset_symbol, metadata_json)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.user!.id, transaction.user_id, `TX_APPROVE_${transaction.type}`, transaction.amount, transaction.asset_symbol, JSON.stringify({ txId })]
      );
      return updated.rows[0];
    });
    res.json({ transaction: tx });
  } catch (err: any) {
    if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Transaction not found' });
    if (err.message === 'NOT_PENDING') return res.status(400).json({ error: 'Transaction is not pending' });
    if (err instanceof InsufficientBalanceError) return res.status(400).json({ error: err.message });
    console.error('[admin] approve transaction failed', err);
    res.status(500).json({ error: 'Failed to approve transaction' });
  }
});

router.post('/transactions/:id/reject', async (req, res) => {
  const txId = req.params.id;
  try {
    const tx = await withTransaction(async (client) => {
      const txRes = await client.query(`SELECT * FROM transactions WHERE id = $1 FOR UPDATE`, [txId]);
      const transaction = txRes.rows[0];
      if (!transaction) throw new Error('NOT_FOUND');
      if (transaction.status !== 'PENDING') throw new Error('NOT_PENDING');

      if (transaction.type === 'WITHDRAWAL') {
        await unlockFunds(client, transaction.user_id, transaction.asset_symbol, parseFloat(transaction.amount));
      }
      // DEPOSIT rejection requires no balance change since nothing was credited yet.

      const updated = await client.query(
        `UPDATE transactions SET status = 'REJECTED', admin_id = $2, updated_at = now() WHERE id = $1 RETURNING *`,
        [txId, req.user!.id]
      );
      await client.query(
        `INSERT INTO admin_audit_logs (admin_id, target_user_id, action_type, amount, asset_symbol, metadata_json)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.user!.id, transaction.user_id, `TX_REJECT_${transaction.type}`, transaction.amount, transaction.asset_symbol, JSON.stringify({ txId })]
      );
      return updated.rows[0];
    });
    res.json({ transaction: tx });
  } catch (err: any) {
    if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Transaction not found' });
    if (err.message === 'NOT_PENDING') return res.status(400).json({ error: 'Transaction is not pending' });
    console.error('[admin] reject transaction failed', err);
    res.status(500).json({ error: 'Failed to reject transaction' });
  }
});

// --- Price overrides ------------------------------------------------------

const overrideSchema = z.object({
  pair: z.string().min(3),
  price: z.number().positive(),
});

router.post('/prices/override', async (req, res) => {
  const parsed = overrideSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const pair = parsed.data.pair.toUpperCase();
  const price = parsed.data.price;

  await redis.set(overridePriceKey(pair), JSON.stringify({ price, isActive: true, updatedBy: req.user!.id, updatedAt: Date.now() }));
  await pool.query(
    `INSERT INTO price_overrides (pair, custom_price, is_active, updated_by, updated_at)
     VALUES ($1, $2, true, $3, now())
     ON CONFLICT (pair) DO UPDATE SET custom_price = $2, is_active = true, updated_by = $3, updated_at = now()`,
    [pair, price, req.user!.id]
  );
  await logAudit(req.user!.id, 'PRICE_OVERRIDE_SET', { assetSymbol: pair, amount: price });

  const resolved = await resolvePrice(pair);
  if (resolved) await redisPub.publish(CHANNELS.MARKET_PRICES, JSON.stringify(resolved));

  res.json({ ok: true, pair, price });
});

router.delete('/prices/override/:pair', async (req, res) => {
  const pair = req.params.pair.toUpperCase();
  await redis.del(overridePriceKey(pair));
  await pool.query(`UPDATE price_overrides SET is_active = false, updated_by = $2, updated_at = now() WHERE pair = $1`, [pair, req.user!.id]);
  await logAudit(req.user!.id, 'PRICE_OVERRIDE_CLEAR', { assetSymbol: pair });

  const resolved = await resolvePrice(pair);
  if (resolved) await redisPub.publish(CHANNELS.MARKET_PRICES, JSON.stringify(resolved));

  res.json({ ok: true, pair });
});

router.get('/prices/overrides', async (_req, res) => {
  const result = await pool.query(`SELECT * FROM price_overrides ORDER BY pair`);
  res.json({ overrides: result.rows });
});

// --- Deposit bank configuration ------------------------------------------

const bankSchema = z.object({
  bankName: z.string().min(1).max(255),
  accountHolder: z.string().min(1).max(255),
  accountNumber: z.string().min(1).max(100),
  iban: z.string().max(100).optional(),
  swiftCode: z.string().max(50).optional(),
  currency: z.string().min(2).max(20),
  instructions: z.string().max(1000).optional(),
});

router.get('/banks', async (_req, res) => {
  const result = await pool.query(`SELECT * FROM deposit_banks ORDER BY is_active DESC, created_at DESC`);
  res.json({ banks: result.rows });
});

router.post('/banks', async (req, res) => {
  const parsed = bankSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { bankName, accountHolder, accountNumber, iban, swiftCode, currency, instructions } = parsed.data;

  const result = await pool.query(
    `INSERT INTO deposit_banks (bank_name, account_holder, account_number, iban, swift_code, currency, instructions, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [bankName, accountHolder, accountNumber, iban || null, swiftCode || null, currency.toUpperCase(), instructions || null, req.user!.id]
  );
  await logAudit(req.user!.id, 'BANK_CREATE', { metadata: { bankId: result.rows[0].id, bankName } });
  res.status(201).json({ bank: result.rows[0] });
});

const bankUpdateSchema = bankSchema.partial().extend({
  isActive: z.boolean().optional(),
});

router.patch('/banks/:id', async (req, res) => {
  const parsed = bankUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const fields = parsed.data;

  const columns: Record<string, string> = {
    bankName: 'bank_name',
    accountHolder: 'account_holder',
    accountNumber: 'account_number',
    iban: 'iban',
    swiftCode: 'swift_code',
    currency: 'currency',
    instructions: 'instructions',
    isActive: 'is_active',
  };

  const sets: string[] = [];
  const values: any[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    values.push(key === 'currency' ? String(value).toUpperCase() : value);
    sets.push(`${columns[key]} = $${values.length}`);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id);
  const result = await pool.query(
    `UPDATE deposit_banks SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Bank not found' });

  await logAudit(req.user!.id, 'BANK_UPDATE', { metadata: { bankId: req.params.id, fields } });
  res.json({ bank: result.rows[0] });
});

router.delete('/banks/:id', async (req, res) => {
  const result = await pool.query(`DELETE FROM deposit_banks WHERE id = $1 RETURNING id`, [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Bank not found' });
  await logAudit(req.user!.id, 'BANK_DELETE', { metadata: { bankId: req.params.id } });
  res.json({ ok: true });
});

// --- Short-term trade durations -------------------------------------------

const durationSchema = z.object({
  label: z.string().min(1).max(50),
  seconds: z.number().int().positive(),
  payoutMultiplier: z.number().gt(1),
});

router.get('/trade-durations', async (_req, res) => {
  const result = await pool.query(`SELECT * FROM trade_durations ORDER BY sort_order ASC, seconds ASC`);
  res.json({ durations: result.rows });
});

router.post('/trade-durations', async (req, res) => {
  const parsed = durationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { label, seconds, payoutMultiplier } = parsed.data;

  const maxOrder = await pool.query(`SELECT COALESCE(MAX(sort_order), 0) AS max FROM trade_durations`);
  const result = await pool.query(
    `INSERT INTO trade_durations (label, seconds, payout_multiplier, sort_order) VALUES ($1, $2, $3, $4) RETURNING *`,
    [label, seconds, payoutMultiplier, maxOrder.rows[0].max + 1]
  );
  await logAudit(req.user!.id, 'DURATION_CREATE', { metadata: { durationId: result.rows[0].id, label } });
  res.status(201).json({ duration: result.rows[0] });
});

const durationUpdateSchema = durationSchema.partial().extend({ isActive: z.boolean().optional() });

router.patch('/trade-durations/:id', async (req, res) => {
  const parsed = durationUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const fields = parsed.data;

  const columns: Record<string, string> = { label: 'label', seconds: 'seconds', payoutMultiplier: 'payout_multiplier', isActive: 'is_active' };
  const sets: string[] = [];
  const values: any[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    values.push(value);
    sets.push(`${columns[key]} = $${values.length}`);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id);
  const result = await pool.query(
    `UPDATE trade_durations SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Duration not found' });
  res.json({ duration: result.rows[0] });
});

router.delete('/trade-durations/:id', async (req, res) => {
  const result = await pool.query(`DELETE FROM trade_durations WHERE id = $1 RETURNING id`, [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Duration not found' });
  res.json({ ok: true });
});

// --- Short-term trade outcome overrides (bull/bear rigging for testing) --

const outcomeSchema = z.object({
  userId: z.string().uuid().optional(),
  pair: z.string().optional(),
  forcedOutcome: z.enum(['BULL', 'BEAR', 'WIN', 'LOSE']),
});

router.get('/trade-outcomes', async (_req, res) => {
  const result = await pool.query(
    `SELECT o.*, u.email AS user_email FROM trade_outcome_overrides o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC`
  );
  res.json({ overrides: result.rows });
});

router.post('/trade-outcomes', async (req, res) => {
  const parsed = outcomeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { userId, pair, forcedOutcome } = parsed.data;

  const result = await pool.query(
    `INSERT INTO trade_outcome_overrides (user_id, pair, forced_outcome, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId || null, pair ? pair.toUpperCase() : null, forcedOutcome, req.user!.id]
  );
  await logAudit(req.user!.id, 'TRADE_OUTCOME_SET', {
    targetUserId: userId,
    assetSymbol: pair?.toUpperCase(),
    metadata: { forcedOutcome, overrideId: result.rows[0].id },
  });
  res.status(201).json({ override: result.rows[0] });
});

router.patch('/trade-outcomes/:id', async (req, res) => {
  const isActive = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!isActive.success) return res.status(400).json({ error: isActive.error.flatten() });

  const result = await pool.query(
    `UPDATE trade_outcome_overrides SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING *`,
    [req.params.id, isActive.data.isActive]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Override not found' });
  res.json({ override: result.rows[0] });
});

router.delete('/trade-outcomes/:id', async (req, res) => {
  const result = await pool.query(`DELETE FROM trade_outcome_overrides WHERE id = $1 RETURNING id`, [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Override not found' });
  res.json({ ok: true });
});

router.get('/short-term-trades', async (req, res) => {
  const status = (req.query.status as string | undefined)?.toUpperCase();
  const params: any[] = [];
  let query = `SELECT t.*, u.email FROM short_term_trades t JOIN users u ON u.id = t.user_id`;
  if (status) {
    params.push(status);
    query += ` WHERE t.outcome = $1`;
  }
  query += ' ORDER BY t.created_at DESC LIMIT 300';
  const result = await pool.query(query, params);
  res.json({ trades: result.rows });
});

// --- Explore-tab promotions -------------------------------------------------

const promotionSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  badgeText: z.string().max(50).optional(),
});

router.get('/promotions', async (_req, res) => {
  const result = await pool.query(`SELECT * FROM promotions ORDER BY created_at DESC`);
  res.json({ promotions: result.rows });
});

router.post('/promotions', async (req, res) => {
  const parsed = promotionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { title, description, badgeText } = parsed.data;

  const result = await pool.query(
    `INSERT INTO promotions (title, description, badge_text, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
    [title, description || null, badgeText || null, req.user!.id]
  );
  res.status(201).json({ promotion: result.rows[0] });
});

router.patch('/promotions/:id', async (req, res) => {
  const parsed = promotionSchema.partial().extend({ isActive: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const fields = parsed.data;

  const columns: Record<string, string> = { title: 'title', description: 'description', badgeText: 'badge_text', isActive: 'is_active' };
  const sets: string[] = [];
  const values: any[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    values.push(value);
    sets.push(`${columns[key]} = $${values.length}`);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id);
  const result = await pool.query(
    `UPDATE promotions SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Promotion not found' });
  res.json({ promotion: result.rows[0] });
});

router.delete('/promotions/:id', async (req, res) => {
  const result = await pool.query(`DELETE FROM promotions WHERE id = $1 RETURNING id`, [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Promotion not found' });
  res.json({ ok: true });
});

// --- P2P oversight ------------------------------------------------------------

router.get('/p2p/orders', async (req, res) => {
  const status = (req.query.status as string | undefined)?.toUpperCase();
  const params: any[] = [];
  let query = `SELECT o.*, m.email AS merchant_email, t.email AS taker_email,
                 CASE WHEN o.disputed_by = o.merchant_id THEN m.email WHEN o.disputed_by = o.taker_id THEN t.email END AS disputed_by_email
               FROM p2p_orders o JOIN users m ON m.id = o.merchant_id JOIN users t ON t.id = o.taker_id`;
  if (status) {
    params.push(status);
    query += ` WHERE o.status = $1`;
  }
  query += ' ORDER BY o.created_at DESC LIMIT 300';
  const result = await pool.query(query, params);
  res.json({ orders: result.rows });
});

router.get('/p2p/orders/:id/receipts', async (req, res) => {
  const result = await pool.query(
    `SELECT r.id, r.order_id, r.file_name, r.mime_type, r.file_data, r.created_at, u.email AS uploaded_by_email
     FROM p2p_order_receipts r JOIN users u ON u.id = r.uploaded_by
     WHERE r.order_id = $1 ORDER BY r.created_at ASC`,
    [req.params.id]
  );
  res.json({ receipts: result.rows });
});

const resolveSchema = z.object({ action: z.enum(['complete', 'cancel']) });

router.post('/p2p/orders/:id/resolve', async (req, res) => {
  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const order = await withTransaction(async (client) => {
      const res = await client.query(`SELECT * FROM p2p_orders WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const order = res.rows[0];
      if (!order) throw new Error('NOT_FOUND');
      if (!['PENDING_PAYMENT', 'PAID', 'DISPUTED'].includes(order.status)) throw new Error('NOT_RESOLVABLE');

      const sellerId = order.ad_side === 'SELL' ? order.merchant_id : order.taker_id;
      const buyerId = order.ad_side === 'SELL' ? order.taker_id : order.merchant_id;

      if (parsed.data.action === 'complete') {
        await deductLocked(client, sellerId, order.asset_symbol, parseFloat(order.amount));
        await creditAvailable(client, buyerId, order.asset_symbol, parseFloat(order.amount));
        const updated = await client.query(
          `UPDATE p2p_orders SET status = 'COMPLETED', completed_at = now() WHERE id = $1 RETURNING *`,
          [order.id]
        );
        return updated.rows[0];
      } else {
        await unlockFunds(client, sellerId, order.asset_symbol, parseFloat(order.amount));
        await client.query(`UPDATE p2p_ads SET available_amount = available_amount + $2, updated_at = now() WHERE id = $1`, [
          order.ad_id,
          order.amount,
        ]);
        const updated = await client.query(
          `UPDATE p2p_orders SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1 RETURNING *`,
          [order.id]
        );
        return updated.rows[0];
      }
    });

    await logAudit(req.user!.id, `P2P_DISPUTE_${parsed.data.action.toUpperCase()}`, { targetUserId: order.taker_id, metadata: { orderId: order.id } });
    res.json({ order });
  } catch (err: any) {
    if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Order not found' });
    if (err.message === 'NOT_RESOLVABLE') return res.status(400).json({ error: 'Order cannot be resolved in its current state' });
    console.error('[admin] p2p resolve failed', err);
    res.status(500).json({ error: 'Failed to resolve order' });
  }
});

// --- Bonus programs ----------------------------------------------------------

const registrationBonusSchema = z.object({
  assetSymbol: z.string().min(2).max(20),
  amount: z.number().positive(),
  isActive: z.boolean().default(true),
});

router.get('/bonus/registration', async (_req, res) => {
  const result = await pool.query(`SELECT * FROM registration_bonus_config ORDER BY updated_at DESC LIMIT 1`);
  res.json({ config: result.rows[0] || null });
});

router.put('/bonus/registration', async (req, res) => {
  const parsed = registrationBonusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { assetSymbol, amount, isActive } = parsed.data;

  const result = await pool.query(
    `INSERT INTO registration_bonus_config (asset_symbol, amount, is_active, updated_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [assetSymbol.toUpperCase(), amount, isActive, req.user!.id]
  );
  await logAudit(req.user!.id, 'BONUS_REGISTRATION_CONFIG', { amount, assetSymbol: assetSymbol.toUpperCase(), metadata: { isActive } });
  res.status(201).json({ config: result.rows[0] });
});

const referralProgramSchema = z.object({
  referrerBonusAmount: z.number().nonnegative(),
  refereeBonusAmount: z.number().nonnegative(),
  assetSymbol: z.string().min(2).max(20),
  isActive: z.boolean().default(true),
});

router.get('/bonus/referral', async (_req, res) => {
  const result = await pool.query(`SELECT * FROM referral_program_config ORDER BY updated_at DESC LIMIT 1`);
  res.json({ config: result.rows[0] || null });
});

router.put('/bonus/referral', async (req, res) => {
  const parsed = referralProgramSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { referrerBonusAmount, refereeBonusAmount, assetSymbol, isActive } = parsed.data;

  const result = await pool.query(
    `INSERT INTO referral_program_config (referrer_bonus_amount, referee_bonus_amount, asset_symbol, is_active, updated_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [referrerBonusAmount, refereeBonusAmount, assetSymbol.toUpperCase(), isActive, req.user!.id]
  );
  await logAudit(req.user!.id, 'BONUS_REFERRAL_CONFIG', { assetSymbol: assetSymbol.toUpperCase(), metadata: { referrerBonusAmount, refereeBonusAmount, isActive } });
  res.status(201).json({ config: result.rows[0] });
});

router.get('/bonus/referrals', async (_req, res) => {
  const result = await pool.query(
    `SELECT r.*, ru.email AS referrer_email, ree.email AS referred_email
     FROM referrals r JOIN users ru ON ru.id = r.referrer_id JOIN users ree ON ree.id = r.referred_user_id
     ORDER BY r.created_at DESC LIMIT 200`
  );
  res.json({ referrals: result.rows });
});

const milestoneSchema = z.object({
  label: z.string().min(1).max(100),
  targetVolume: z.number().positive(),
  bonusAmount: z.number().positive(),
  bonusAsset: z.string().min(2).max(20).default('USDT'),
  isRepeatable: z.boolean().default(false),
});

router.get('/bonus/milestones', async (_req, res) => {
  const result = await pool.query(`SELECT * FROM trading_milestones ORDER BY target_volume ASC`);
  res.json({ milestones: result.rows });
});

router.post('/bonus/milestones', async (req, res) => {
  const parsed = milestoneSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const result = await pool.query(
    `INSERT INTO trading_milestones (label, target_volume, bonus_amount, bonus_asset, is_repeatable)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [d.label, d.targetVolume, d.bonusAmount, d.bonusAsset.toUpperCase(), d.isRepeatable]
  );
  await logAudit(req.user!.id, 'BONUS_MILESTONE_CREATE', { metadata: { milestoneId: result.rows[0].id, label: d.label } });
  res.status(201).json({ milestone: result.rows[0] });
});

const milestoneUpdateSchema = milestoneSchema.partial().extend({ isActive: z.boolean().optional() });

router.patch('/bonus/milestones/:id', async (req, res) => {
  const parsed = milestoneUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const fields = parsed.data;

  const columns: Record<string, string> = {
    label: 'label',
    targetVolume: 'target_volume',
    bonusAmount: 'bonus_amount',
    bonusAsset: 'bonus_asset',
    isRepeatable: 'is_repeatable',
    isActive: 'is_active',
  };
  const sets: string[] = [];
  const values: any[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    values.push(key === 'bonusAsset' ? String(value).toUpperCase() : value);
    sets.push(`${columns[key]} = $${values.length}`);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id);
  const result = await pool.query(
    `UPDATE trading_milestones SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Milestone not found' });
  res.json({ milestone: result.rows[0] });
});

router.delete('/bonus/milestones/:id', async (req, res) => {
  const result = await pool.query(`DELETE FROM trading_milestones WHERE id = $1 RETURNING id`, [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Milestone not found' });
  res.json({ ok: true });
});

router.get('/bonus/claims', async (req, res) => {
  const result = await pool.query(
    `SELECT c.*, u.email, m.label AS milestone_label
     FROM user_milestone_claims c JOIN users u ON u.id = c.user_id JOIN trading_milestones m ON m.id = c.milestone_id
     ORDER BY c.claimed_at DESC LIMIT 200`
  );
  res.json({ claims: result.rows });
});

// --- Site branding ------------------------------------------------------------

router.get('/branding', async (_req, res) => {
  const result = await pool.query(`SELECT * FROM site_branding_config ORDER BY updated_at DESC LIMIT 1`);
  res.json({ config: result.rows[0] || null });
});

const brandingSchema = z.object({
  siteName: z.string().min(1).max(100),
  tagline: z.string().max(255).optional(),
  logoData: z.string().max(4_000_000).optional(),
  logoMimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']).optional(),
  clearLogo: z.boolean().optional(),
});

router.put('/branding', async (req, res) => {
  const parsed = brandingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const current = await pool.query(`SELECT * FROM site_branding_config ORDER BY updated_at DESC LIMIT 1`);
  const existing = current.rows[0];

  const logoData = d.clearLogo ? null : d.logoData ?? existing?.logo_data ?? null;
  const logoMimeType = d.clearLogo ? null : d.logoMimeType ?? existing?.logo_mime_type ?? null;

  const result = await pool.query(
    `INSERT INTO site_branding_config (site_name, tagline, logo_data, logo_mime_type, updated_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, site_name, tagline, logo_mime_type, updated_at`,
    [d.siteName, d.tagline || existing?.tagline || 'Simulated crypto trading. No real funds involved.', logoData, logoMimeType, req.user!.id]
  );
  await logAudit(req.user!.id, 'BRANDING_UPDATE', { metadata: { siteName: d.siteName } });
  res.status(201).json({ config: result.rows[0] });
});

// --- Telegram promo ------------------------------------------------------------

router.get('/telegram-promo', async (_req, res) => {
  const result = await pool.query(`SELECT * FROM telegram_promo_config ORDER BY updated_at DESC LIMIT 1`);
  res.json({ config: result.rows[0] || null });
});

const telegramSchema = z.object({
  telegramUrl: z.string().url().max(500),
  popupTitle: z.string().min(1).max(255),
  popupMessage: z.string().min(1).max(1000),
  buttonText: z.string().min(1).max(100),
  isActive: z.boolean(),
  showPopup: z.boolean(),
});

router.put('/telegram-promo', async (req, res) => {
  const parsed = telegramSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const result = await pool.query(
    `INSERT INTO telegram_promo_config
       (telegram_url, popup_title, popup_message, button_text, is_active, show_popup, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [d.telegramUrl, d.popupTitle, d.popupMessage, d.buttonText, d.isActive, d.showPopup, req.user!.id]
  );
  await logAudit(req.user!.id, 'TELEGRAM_PROMO_UPDATE', { metadata: { isActive: d.isActive } });
  res.status(201).json({ config: result.rows[0] });
});

// --- Audit logs -------------------------------------------------------------

router.get('/audit-logs', async (req, res) => {
  const targetUserId = req.query.userId as string | undefined;
  const params: any[] = [];
  let query = `SELECT l.*, a.email AS admin_email FROM admin_audit_logs l JOIN users a ON a.id = l.admin_id`;
  if (targetUserId) {
    params.push(targetUserId);
    query += ` WHERE l.target_user_id = $1`;
  }
  query += ' ORDER BY l.created_at DESC LIMIT 300';
  const result = await pool.query(query, params);
  res.json({ logs: result.rows });
});

export default router;
