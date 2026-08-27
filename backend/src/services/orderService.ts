import { PoolClient } from 'pg';
import { withTransaction } from '../db';
import { lockFunds, unlockFunds, deductLocked, creditAvailable, InsufficientBalanceError } from './ledger';
import { resolvePrice } from './priceResolver';
import { redisPub, CHANNELS } from '../redis';

export class OrderValidationError extends Error {}

function parsePair(pair: string): { base: string; quote: string } {
  // Supports pairs like BTCUSDT (quote is the trailing known fiat symbol)
  const knownQuotes = ['USDT', 'USD', 'BUSD'];
  const quote = knownQuotes.find((q) => pair.endsWith(q));
  if (!quote) throw new OrderValidationError(`Unsupported pair ${pair}`);
  return { base: pair.slice(0, pair.length - quote.length), quote };
}

interface PlaceOrderInput {
  userId: string;
  pair: string;
  type: 'MARKET' | 'LIMIT';
  side: 'BUY' | 'SELL';
  price?: number;
  amount: number;
}

/**
 * Places an order. BUY locks quote asset (price * amount); SELL locks base asset (amount).
 * MARKET orders fill immediately against the resolved price within the same transaction.
 * LIMIT orders are left OPEN for the matching engine to fill later.
 */
export async function placeOrder(input: PlaceOrderInput) {
  const { userId, pair, type, side, amount } = input;
  if (amount <= 0) throw new OrderValidationError('amount must be positive');
  const { base, quote } = parsePair(pair);

  if (type === 'LIMIT') {
    if (!input.price || input.price <= 0) throw new OrderValidationError('price is required for LIMIT orders');
  }

  const resolved = await resolvePrice(pair);
  if (!resolved) throw new OrderValidationError(`No price available for ${pair}`);

  const executionPrice = type === 'MARKET' ? resolved.price : (input.price as number);
  const lockAsset = side === 'BUY' ? quote : base;
  const lockAmount = side === 'BUY' ? executionPrice * amount : amount;

  return withTransaction(async (client) => {
    await lockFunds(client, userId, lockAsset, lockAmount);

    // MARKET orders persist the resolved execution price too (informational — fills always
    // use the live price at fill time regardless — and it lets volume/reporting queries sum
    // filled_amount * price without special-casing order type).
    const orderRes = await client.query(
      `INSERT INTO orders (user_id, pair, type, side, price, amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'OPEN')
       RETURNING *`,
      [userId, pair, type, side, type === 'LIMIT' ? input.price : executionPrice, amount]
    );
    const order = orderRes.rows[0];

    if (type === 'MARKET') {
      await fillOrder(client, order, resolved.price, amount);
      const finalRes = await client.query(`SELECT * FROM orders WHERE id = $1`, [order.id]);
      return finalRes.rows[0];
    }

    return order;
  });
}

/** Executes a fill for `fillAmount` units of base asset at `fillPrice`, updating balances and order state. */
export async function fillOrder(client: PoolClient, order: any, fillPrice: number, fillAmount: number) {
  const { base, quote } = parsePair(order.pair);
  const quoteAmount = fillPrice * fillAmount;

  if (order.side === 'BUY') {
    // Quote was locked at order price (or market price); release any difference, deduct actual cost, credit base.
    const lockedForThisFill = (order.type === 'LIMIT' ? parseFloat(order.price) : fillPrice) * fillAmount;
    await deductLocked(client, order.user_id, quote, lockedForThisFill);
    if (lockedForThisFill > quoteAmount) {
      await creditAvailable(client, order.user_id, quote, lockedForThisFill - quoteAmount);
    } else if (quoteAmount > lockedForThisFill) {
      // Shouldn't happen for LIMIT (fills at limit or better); guard for MARKET slippage edge cases.
      await deductLocked(client, order.user_id, quote, quoteAmount - lockedForThisFill).catch(() => {});
    }
    await creditAvailable(client, order.user_id, base, fillAmount);
  } else {
    await deductLocked(client, order.user_id, base, fillAmount);
    await creditAvailable(client, order.user_id, quote, quoteAmount);
  }

  const newFilled = parseFloat(order.filled_amount || 0) + fillAmount;
  const totalAmount = parseFloat(order.amount);
  const newStatus = newFilled >= totalAmount ? 'FILLED' : 'PARTIALLY_FILLED';

  await client.query(
    `UPDATE orders SET filled_amount = $2, status = $3, updated_at = now(), filled_at = CASE WHEN $3::order_status = 'FILLED' THEN now() ELSE filled_at END
     WHERE id = $1`,
    [order.id, newFilled, newStatus]
  );

  await redisPub.publish(
    CHANNELS.ORDER_EVENTS,
    JSON.stringify({ orderId: order.id, userId: order.user_id, pair: order.pair, status: newStatus, fillPrice, fillAmount })
  );
}

export async function cancelOrder(userId: string, orderId: string, isAdmin = false) {
  return withTransaction(async (client) => {
    const res = await client.query(
      `SELECT * FROM orders WHERE id = $1 ${isAdmin ? '' : 'AND user_id = $2'} FOR UPDATE`,
      isAdmin ? [orderId] : [orderId, userId]
    );
    const order = res.rows[0];
    if (!order) throw new OrderValidationError('Order not found');
    if (order.status !== 'OPEN' && order.status !== 'PARTIALLY_FILLED') {
      throw new OrderValidationError('Order cannot be canceled in its current state');
    }

    const { base, quote } = parsePair(order.pair);
    const remaining = parseFloat(order.amount) - parseFloat(order.filled_amount || 0);
    const lockAsset = order.side === 'BUY' ? quote : base;
    const lockAmount = order.side === 'BUY' ? parseFloat(order.price) * remaining : remaining;

    await unlockFunds(client, order.user_id, lockAsset, lockAmount);
    await client.query(`UPDATE orders SET status = 'CANCELED', updated_at = now() WHERE id = $1`, [orderId]);

    return { ...order, status: 'CANCELED' };
  });
}

export { parsePair };
