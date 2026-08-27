import { PoolClient } from 'pg';
import { pool, withTransaction } from './db';
import { deductLocked, creditAvailable } from './ledger';
import { redisPub, CHANNELS } from './redis';

function parsePair(pair: string): { base: string; quote: string } {
  const knownQuotes = ['USDT', 'USD', 'BUSD'];
  const quote = knownQuotes.find((q) => pair.endsWith(q));
  if (!quote) throw new Error(`Unsupported pair ${pair}`);
  return { base: pair.slice(0, pair.length - quote.length), quote };
}

async function fillOrder(client: PoolClient, order: any, fillPrice: number) {
  const { base, quote } = parsePair(order.pair);
  const remaining = parseFloat(order.amount) - parseFloat(order.filled_amount || 0);
  const quoteAmount = fillPrice * remaining;
  const lockedForThisFill = parseFloat(order.price) * remaining;

  if (order.side === 'BUY') {
    await deductLocked(client, order.user_id, quote, lockedForThisFill);
    // Limit buys fill at the limit price or better; refund any favorable difference.
    if (lockedForThisFill > quoteAmount) {
      await creditAvailable(client, order.user_id, quote, lockedForThisFill - quoteAmount);
    }
    await creditAvailable(client, order.user_id, base, remaining);
  } else {
    await deductLocked(client, order.user_id, base, remaining);
    await creditAvailable(client, order.user_id, quote, quoteAmount);
  }

  await client.query(
    `UPDATE orders
     SET filled_amount = amount, status = 'FILLED', updated_at = now(), filled_at = now()
     WHERE id = $1`,
    [order.id]
  );

  await redisPub.publish(
    CHANNELS.ORDER_EVENTS,
    JSON.stringify({ orderId: order.id, userId: order.user_id, pair: order.pair, status: 'FILLED', fillPrice, fillAmount: remaining })
  );

  console.log(`[matching-engine] filled order ${order.id} (${order.side} ${order.pair}) @ ${fillPrice}`);
}

/**
 * Called on every resolved price update for a pair. Finds open LIMIT orders whose
 * trigger condition is satisfied by the current price and fills them one at a time,
 * each within its own atomic transaction so a failure on one order never blocks others.
 */
export async function processPriceUpdate(pair: string, price: number) {
  const candidates = await pool.query(
    `SELECT id FROM orders
     WHERE pair = $1 AND type = 'LIMIT' AND status IN ('OPEN', 'PARTIALLY_FILLED')
       AND ((side = 'BUY' AND price >= $2) OR (side = 'SELL' AND price <= $2))
     ORDER BY created_at ASC`,
    [pair, price]
  );

  for (const row of candidates.rows) {
    try {
      await withTransaction(async (client) => {
        const res = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [row.id]);
        const order = res.rows[0];
        if (!order || !['OPEN', 'PARTIALLY_FILLED'].includes(order.status)) return;

        const triggered = order.side === 'BUY' ? parseFloat(order.price) >= price : parseFloat(order.price) <= price;
        if (!triggered) return;

        await fillOrder(client, order, price);
      });
    } catch (err) {
      console.error(`[matching-engine] failed to process order ${row.id}`, err);
    }
  }
}
