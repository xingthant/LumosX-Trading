import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { pool, withTransaction } from '../db';
import { lockFunds, unlockFunds, deductLocked, creditAvailable, InsufficientBalanceError } from '../services/ledger';

const router = Router();
router.use(requireAuth);

class P2PError extends Error {}

// Payment window presets, matching how real P2P desks bound the "pay within" timer.
export const PAYMENT_WINDOW_MINUTES = [1, 15, 30] as const;

async function requireMerchant(req: Request, res: Response, next: NextFunction) {
  const result = await pool.query('SELECT is_merchant FROM users WHERE id = $1', [req.user!.id]);
  if (!result.rows[0]?.is_merchant) {
    return res.status(403).json({ error: 'Merchant status required. Ask an admin to grant it.' });
  }
  next();
}

/** From the ad's perspective: who supplies the crypto (seller) and who receives it (buyer). */
function resolveParties(adSide: 'BUY' | 'SELL', merchantId: string, takerId: string) {
  return adSide === 'SELL' ? { sellerId: merchantId, buyerId: takerId } : { sellerId: takerId, buyerId: merchantId };
}

// --- Ads --------------------------------------------------------------------

router.get('/ads', async (req, res) => {
  const side = (req.query.side as string | undefined)?.toUpperCase();
  const asset = (req.query.asset as string | undefined)?.toUpperCase();
  const params: any[] = [];
  let query = `SELECT a.*, u.email AS merchant_email
               FROM p2p_ads a JOIN users u ON u.id = a.merchant_id
               WHERE a.status = 'ACTIVE' AND a.available_amount > 0`;
  if (side === 'BUY' || side === 'SELL') {
    params.push(side);
    query += ` AND a.side = $${params.length}`;
  }
  if (asset) {
    params.push(asset);
    query += ` AND a.asset_symbol = $${params.length}`;
  }
  query += ' ORDER BY a.price ASC';
  const result = await pool.query(query, params);
  res.json({ ads: result.rows });
});

router.get('/ads/mine', requireMerchant, async (req, res) => {
  const result = await pool.query(`SELECT * FROM p2p_ads WHERE merchant_id = $1 ORDER BY created_at DESC`, [req.user!.id]);
  res.json({ ads: result.rows });
});

const adSchema = z.object({
  side: z.enum(['BUY', 'SELL']),
  assetSymbol: z.string().min(2).max(20),
  fiatSymbol: z.string().min(2).max(10),
  price: z.number().positive(),
  minAmount: z.number().positive(),
  maxAmount: z.number().positive(),
  availableAmount: z.number().positive(),
  paymentWindowMinutes: z.union([z.literal(1), z.literal(15), z.literal(30)]).optional(),
  paymentMethods: z.array(z.string().min(1).max(50)).min(1),
  terms: z.string().max(1000).optional(),
});

router.post('/ads', requireMerchant, async (req, res) => {
  const parsed = adSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  if (d.maxAmount < d.minAmount) return res.status(400).json({ error: 'maxAmount must be >= minAmount' });

  const result = await pool.query(
    `INSERT INTO p2p_ads
       (merchant_id, side, asset_symbol, fiat_symbol, price, min_amount, max_amount, available_amount, payment_window_minutes, payment_methods, terms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      req.user!.id,
      d.side,
      d.assetSymbol.toUpperCase(),
      d.fiatSymbol.toUpperCase(),
      d.price,
      d.minAmount,
      d.maxAmount,
      d.availableAmount,
      d.paymentWindowMinutes || 15,
      d.paymentMethods,
      d.terms || null,
    ]
  );
  res.status(201).json({ ad: result.rows[0] });
});

const adUpdateSchema = z.object({
  price: z.number().positive().optional(),
  minAmount: z.number().positive().optional(),
  maxAmount: z.number().positive().optional(),
  availableAmount: z.number().nonnegative().optional(),
  paymentMethods: z.array(z.string().min(1).max(50)).min(1).optional(),
  terms: z.string().max(1000).optional(),
  status: z.enum(['ACTIVE', 'PAUSED']).optional(),
});

router.patch('/ads/:id', requireMerchant, async (req, res) => {
  const parsed = adUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const fields = parsed.data;

  const columns: Record<string, string> = {
    price: 'price',
    minAmount: 'min_amount',
    maxAmount: 'max_amount',
    availableAmount: 'available_amount',
    paymentMethods: 'payment_methods',
    terms: 'terms',
    status: 'status',
  };
  const sets: string[] = [];
  const values: any[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    values.push(value);
    sets.push(`${columns[key]} = $${values.length}`);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id, req.user!.id);
  const result = await pool.query(
    `UPDATE p2p_ads SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length - 1} AND merchant_id = $${values.length} RETURNING *`,
    values
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Ad not found' });
  res.json({ ad: result.rows[0] });
});

router.delete('/ads/:id', requireMerchant, async (req, res) => {
  try {
    const activeOrders = await pool.query(`SELECT 1 FROM p2p_orders WHERE ad_id = $1 LIMIT 1`, [req.params.id]);
    if (activeOrders.rowCount && activeOrders.rowCount > 0) {
      return res.status(400).json({
        error: 'This ad has order history and cannot be deleted — pause it instead to hide it from the marketplace.',
      });
    }
    const result = await pool.query(`DELETE FROM p2p_ads WHERE id = $1 AND merchant_id = $2 RETURNING id`, [req.params.id, req.user!.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Ad not found' });
    res.json({ ok: true });
  } catch (err: any) {
    if (err.code === '23503') {
      return res.status(400).json({
        error: 'This ad has order history and cannot be deleted — pause it instead to hide it from the marketplace.',
      });
    }
    console.error('[p2p] delete ad failed', err);
    res.status(500).json({ error: 'Failed to delete ad' });
  }
});

// --- Orders -------------------------------------------------------------------

const createOrderSchema = z.object({
  adId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.string().max(50).optional(),
});

router.post('/orders', async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { adId, amount, paymentMethod } = parsed.data;

  try {
    const order = await withTransaction(async (client) => {
      const adRes = await client.query(`SELECT * FROM p2p_ads WHERE id = $1 FOR UPDATE`, [adId]);
      const ad = adRes.rows[0];
      if (!ad || ad.status !== 'ACTIVE') throw new P2PError('Ad is not available');
      if (ad.merchant_id === req.user!.id) throw new P2PError('You cannot take your own ad');
      if (amount < parseFloat(ad.min_amount) || amount > parseFloat(ad.max_amount)) {
        throw new P2PError(`Amount must be between ${ad.min_amount} and ${ad.max_amount}`);
      }
      if (amount > parseFloat(ad.available_amount)) throw new P2PError('Ad does not have enough available amount left');

      const { sellerId } = resolveParties(ad.side, ad.merchant_id, req.user!.id);
      await lockFunds(client, sellerId, ad.asset_symbol, amount);

      await client.query(`UPDATE p2p_ads SET available_amount = available_amount - $2, updated_at = now() WHERE id = $1`, [adId, amount]);

      const totalFiat = amount * parseFloat(ad.price);
      const orderRes = await client.query(
        `INSERT INTO p2p_orders
           (ad_id, merchant_id, taker_id, ad_side, asset_symbol, fiat_symbol, amount, price, total_fiat, payment_method, payment_deadline)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() + ($11 || ' minutes')::interval)
         RETURNING *`,
        [
          adId,
          ad.merchant_id,
          req.user!.id,
          ad.side,
          ad.asset_symbol,
          ad.fiat_symbol,
          amount,
          ad.price,
          totalFiat,
          paymentMethod || ad.payment_methods?.[0] || null,
          ad.payment_window_minutes,
        ]
      );
      return orderRes.rows[0];
    });
    res.status(201).json({ order });
  } catch (err) {
    if (err instanceof P2PError || err instanceof InsufficientBalanceError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[p2p] create order failed', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

router.get('/orders', async (req, res) => {
  const result = await pool.query(
    `SELECT o.*, m.email AS merchant_email, t.email AS taker_email
     FROM p2p_orders o
     JOIN users m ON m.id = o.merchant_id
     JOIN users t ON t.id = o.taker_id
     WHERE o.merchant_id = $1 OR o.taker_id = $1
     ORDER BY o.created_at DESC LIMIT 200`,
    [req.user!.id]
  );
  res.json({ orders: result.rows });
});

async function loadOwnedOrder(orderId: string, userId: string) {
  const res = await pool.query(`SELECT * FROM p2p_orders WHERE id = $1 AND (merchant_id = $2 OR taker_id = $2)`, [orderId, userId]);
  return res.rows[0];
}

router.get('/orders/:id', async (req, res) => {
  const owned = await loadOwnedOrder(req.params.id, req.user!.id);
  if (!owned) return res.status(404).json({ error: 'Order not found' });

  const result = await pool.query(
    `SELECT o.*, m.email AS merchant_email, t.email AS taker_email
     FROM p2p_orders o JOIN users m ON m.id = o.merchant_id JOIN users t ON t.id = o.taker_id
     WHERE o.id = $1`,
    [req.params.id]
  );
  res.json({ order: result.rows[0] });
});

router.post('/orders/:id/mark-paid', async (req, res) => {
  const order = await loadOwnedOrder(req.params.id, req.user!.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const { buyerId } = resolveParties(order.ad_side, order.merchant_id, order.taker_id);
  if (buyerId !== req.user!.id) return res.status(403).json({ error: 'Only the buyer can mark this order as paid' });
  if (order.status !== 'PENDING_PAYMENT') return res.status(400).json({ error: 'Order is not awaiting payment' });

  const result = await pool.query(`UPDATE p2p_orders SET status = 'PAID', paid_at = now() WHERE id = $1 RETURNING *`, [order.id]);
  res.json({ order: result.rows[0] });
});

router.post('/orders/:id/release', async (req, res) => {
  try {
    const order = await withTransaction(async (client) => {
      const res = await client.query(`SELECT * FROM p2p_orders WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const order = res.rows[0];
      if (!order || (order.merchant_id !== req.user!.id && order.taker_id !== req.user!.id)) {
        throw new P2PError('Order not found');
      }
      const { sellerId, buyerId } = resolveParties(order.ad_side, order.merchant_id, order.taker_id);
      if (sellerId !== req.user!.id) throw new P2PError('Only the seller can release funds');
      if (order.status !== 'PAID') throw new P2PError('Order must be marked paid before releasing');

      await deductLocked(client, sellerId, order.asset_symbol, parseFloat(order.amount));
      await creditAvailable(client, buyerId, order.asset_symbol, parseFloat(order.amount));

      const updated = await client.query(
        `UPDATE p2p_orders SET status = 'COMPLETED', completed_at = now() WHERE id = $1 RETURNING *`,
        [order.id]
      );
      return updated.rows[0];
    });
    res.json({ order });
  } catch (err) {
    if (err instanceof P2PError || err instanceof InsufficientBalanceError) return res.status(400).json({ error: err.message });
    console.error('[p2p] release failed', err);
    res.status(500).json({ error: 'Failed to release order' });
  }
});

router.post('/orders/:id/cancel', async (req, res) => {
  try {
    const order = await withTransaction(async (client) => {
      const res = await client.query(`SELECT * FROM p2p_orders WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const order = res.rows[0];
      if (!order || (order.merchant_id !== req.user!.id && order.taker_id !== req.user!.id)) {
        throw new P2PError('Order not found');
      }
      if (order.status !== 'PENDING_PAYMENT') throw new P2PError('Only unpaid orders can be cancelled directly — open a dispute instead');

      const { sellerId } = resolveParties(order.ad_side, order.merchant_id, order.taker_id);
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
    });
    res.json({ order });
  } catch (err) {
    if (err instanceof P2PError || err instanceof InsufficientBalanceError) return res.status(400).json({ error: err.message });
    console.error('[p2p] cancel failed', err);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

router.post('/orders/:id/dispute', async (req, res) => {
  const order = await loadOwnedOrder(req.params.id, req.user!.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['PENDING_PAYMENT', 'PAID'].includes(order.status)) return res.status(400).json({ error: 'Order cannot be disputed in its current state' });

  const result = await pool.query(`UPDATE p2p_orders SET status = 'DISPUTED' WHERE id = $1 RETURNING *`, [order.id]);
  res.json({ order: result.rows[0] });
});

// --- Order chat -----------------------------------------------------------------

router.get('/orders/:id/messages', async (req, res) => {
  const order = await loadOwnedOrder(req.params.id, req.user!.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const result = await pool.query(
    `SELECT m.*, u.email AS sender_email FROM p2p_messages m JOIN users u ON u.id = m.sender_id
     WHERE m.order_id = $1 ORDER BY m.created_at ASC`,
    [order.id]
  );
  res.json({ messages: result.rows });
});

router.post('/orders/:id/messages', async (req, res) => {
  const order = await loadOwnedOrder(req.params.id, req.user!.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const parsed = z.object({ message: z.string().min(1).max(1000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const result = await pool.query(
    `INSERT INTO p2p_messages (order_id, sender_id, message) VALUES ($1, $2, $3) RETURNING *`,
    [order.id, req.user!.id, parsed.data.message]
  );
  res.status(201).json({ message: result.rows[0] });
});

// --- Payment receipts -------------------------------------------------------------

const ALLOWED_RECEIPT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

router.get('/orders/:id/receipts', async (req, res) => {
  const order = await loadOwnedOrder(req.params.id, req.user!.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const result = await pool.query(
    `SELECT id, order_id, uploaded_by, file_name, mime_type, file_data, created_at
     FROM p2p_order_receipts WHERE order_id = $1 ORDER BY created_at ASC`,
    [order.id]
  );
  res.json({ receipts: result.rows });
});

const receiptSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  // Base64 payload; ~5MB of image data inflates to ~6.7M base64 chars.
  fileData: z.string().min(1).max(7_000_000),
});

router.post('/orders/:id/receipt', async (req, res) => {
  const order = await loadOwnedOrder(req.params.id, req.user!.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['PENDING_PAYMENT', 'PAID', 'DISPUTED'].includes(order.status)) {
    return res.status(400).json({ error: 'Receipts can only be uploaded on an order awaiting payment, paid, or disputed' });
  }

  const parsed = receiptSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!ALLOWED_RECEIPT_TYPES.includes(parsed.data.mimeType)) {
    return res.status(400).json({ error: 'Unsupported file type' });
  }

  const result = await pool.query(
    `INSERT INTO p2p_order_receipts (order_id, uploaded_by, file_name, mime_type, file_data)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, order_id, uploaded_by, file_name, mime_type, created_at`,
    [order.id, req.user!.id, parsed.data.fileName, parsed.data.mimeType, parsed.data.fileData]
  );
  res.status(201).json({ receipt: result.rows[0] });
});

export default router;
