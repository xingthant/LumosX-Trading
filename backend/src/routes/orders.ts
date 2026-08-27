import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { pool } from '../db';
import { placeOrder, cancelOrder, OrderValidationError } from '../services/orderService';
import { InsufficientBalanceError } from '../services/ledger';

const router = Router();
router.use(requireAuth);

const placeOrderSchema = z.object({
  pair: z.string().min(3),
  type: z.enum(['MARKET', 'LIMIT']),
  side: z.enum(['BUY', 'SELL']),
  price: z.number().positive().optional(),
  amount: z.number().positive(),
});

router.post('/', async (req, res) => {
  const parsed = placeOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const order = await placeOrder({ userId: req.user!.id, ...parsed.data, pair: parsed.data.pair.toUpperCase() });
    res.status(201).json({ order });
  } catch (err) {
    if (err instanceof OrderValidationError || err instanceof InsufficientBalanceError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[orders] place order failed', err);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

router.get('/', async (req, res) => {
  const status = req.query.status as string | undefined;
  const params: any[] = [req.user!.id];
  let query = 'SELECT * FROM orders WHERE user_id = $1';
  if (status) {
    params.push(status.toUpperCase());
    query += ' AND status = $2';
  }
  query += ' ORDER BY created_at DESC LIMIT 200';
  const result = await pool.query(query, params);
  res.json({ orders: result.rows });
});

router.delete('/:id', async (req, res) => {
  try {
    const order = await cancelOrder(req.user!.id, req.params.id);
    res.json({ order });
  } catch (err) {
    if (err instanceof OrderValidationError || err instanceof InsufficientBalanceError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[orders] cancel order failed', err);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

export default router;
