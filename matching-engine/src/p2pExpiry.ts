import { pool, withTransaction } from './db';
import { unlockFunds } from './ledger';

function resolveSellerId(order: any) {
  return order.ad_side === 'SELL' ? order.merchant_id : order.taker_id;
}

/** Auto-cancels P2P orders whose payment window expired without the buyer marking paid. */
export async function expireOverdueP2POrders() {
  const due = await pool.query(
    `SELECT id FROM p2p_orders WHERE status = 'PENDING_PAYMENT' AND payment_deadline <= now() ORDER BY payment_deadline ASC LIMIT 100`
  );

  for (const row of due.rows) {
    try {
      await withTransaction(async (client) => {
        const res = await client.query(`SELECT * FROM p2p_orders WHERE id = $1 FOR UPDATE`, [row.id]);
        const order = res.rows[0];
        if (!order || order.status !== 'PENDING_PAYMENT') return;

        const sellerId = resolveSellerId(order);
        await unlockFunds(client, sellerId, order.asset_symbol, parseFloat(order.amount));
        await client.query(`UPDATE p2p_ads SET available_amount = available_amount + $2, updated_at = now() WHERE id = $1`, [
          order.ad_id,
          order.amount,
        ]);
        await client.query(`UPDATE p2p_orders SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1`, [order.id]);
      });
      console.log(`[matching-engine] auto-cancelled expired P2P order ${row.id}`);
    } catch (err) {
      console.error(`[matching-engine] failed to expire P2P order ${row.id}`, err);
    }
  }
}
