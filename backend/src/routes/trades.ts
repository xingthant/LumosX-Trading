import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { pool, withTransaction } from '../db';
import { lockFunds, InsufficientBalanceError } from '../services/ledger';
import { resolvePrice } from '../services/priceResolver';
import { config } from '../config';

const router = Router();
router.use(requireAuth);

class TradeValidationError extends Error {}

const placeSchema = z.object({
  pair: z.string().min(3),
  direction: z.enum(['UP', 'DOWN']),
  durationId: z.string().uuid(),
  stakeAmount: z.number().positive(),
});

router.post('/short-term', async (req, res) => {
  const parsed = placeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { pair, direction, durationId, stakeAmount } = parsed.data;
  const upperPair = pair.toUpperCase();

  try {
    const durationRes = await pool.query(`SELECT * FROM trade_durations WHERE id = $1 AND is_active = true`, [durationId]);
    const duration = durationRes.rows[0];
    if (!duration) throw new TradeValidationError('Invalid or inactive trade duration');

    const resolved = await resolvePrice(upperPair);
    if (!resolved) throw new TradeValidationError(`No price available for ${upperPair}`);

    const trade = await withTransaction(async (client) => {
      await lockFunds(client, req.user!.id, config.fiatSymbol, stakeAmount);
      const result = await client.query(
        `INSERT INTO short_term_trades
           (user_id, pair, direction, duration_id, duration_label, stake_asset, stake_amount, payout_multiplier, entry_price, expiry_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + ($10 || ' seconds')::interval)
         RETURNING *`,
        [
          req.user!.id,
          upperPair,
          direction,
          duration.id,
          duration.label,
          config.fiatSymbol,
          stakeAmount,
          duration.payout_multiplier,
          resolved.price,
          duration.seconds,
        ]
      );
      return result.rows[0];
    });

    res.status(201).json({ trade });
  } catch (err) {
    if (err instanceof TradeValidationError || err instanceof InsufficientBalanceError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[trades] place short-term trade failed', err);
    res.status(500).json({ error: 'Failed to place trade' });
  }
});

router.get('/short-term', async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM short_term_trades WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [req.user!.id]
  );
  res.json({ trades: result.rows });
});

export default router;
