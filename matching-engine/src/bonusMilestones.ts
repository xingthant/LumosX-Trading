import { pool, withTransaction } from './db';
import { creditAvailable } from './ledger';

/**
 * Sweeps every user's cumulative trading volume (spot fills + short-term trade stakes)
 * against the active milestone tiers and auto-credits any newly-earned bonus. Repeatable
 * milestones can be earned again each time volume crosses another multiple of the target;
 * one-off milestones pay out once. user_milestone_claims prevents double-crediting.
 */
export async function checkTradingMilestones() {
  const milestones = await pool.query(`SELECT * FROM trading_milestones WHERE is_active = true ORDER BY target_volume ASC`);
  if (milestones.rows.length === 0) return;

  const volumes = await pool.query(`
    SELECT u.id AS user_id,
           COALESCE(o.vol, 0) + COALESCE(t.vol, 0) AS volume
    FROM users u
    LEFT JOIN (
      SELECT user_id, SUM(filled_amount * price) AS vol FROM orders
      WHERE status IN ('FILLED', 'PARTIALLY_FILLED') AND price IS NOT NULL GROUP BY user_id
    ) o ON o.user_id = u.id
    LEFT JOIN (
      SELECT user_id, SUM(stake_amount) AS vol FROM short_term_trades GROUP BY user_id
    ) t ON t.user_id = u.id
    WHERE COALESCE(o.vol, 0) + COALESCE(t.vol, 0) > 0
  `);

  for (const row of volumes.rows) {
    const volume = parseFloat(row.volume);

    for (const m of milestones.rows) {
      const target = parseFloat(m.target_volume);
      const timesReached = m.is_repeatable ? Math.floor(volume / target) : volume >= target ? 1 : 0;
      if (timesReached < 1) continue;

      const claimedRes = await pool.query(
        `SELECT COUNT(*)::int AS count FROM user_milestone_claims WHERE user_id = $1 AND milestone_id = $2`,
        [row.user_id, m.id]
      );
      const alreadyClaimed = claimedRes.rows[0].count;
      const owed = timesReached - alreadyClaimed;
      if (owed <= 0) continue;

      for (let i = 1; i <= owed; i++) {
        const claimNumber = alreadyClaimed + i;
        try {
          await withTransaction(async (client) => {
            await client.query(
              `INSERT INTO user_milestone_claims (user_id, milestone_id, claim_number, volume_at_claim, bonus_amount)
               VALUES ($1, $2, $3, $4, $5)`,
              [row.user_id, m.id, claimNumber, volume, m.bonus_amount]
            );
            await creditAvailable(client, row.user_id, m.bonus_asset, parseFloat(m.bonus_amount));
            await client.query(
              `INSERT INTO transactions (user_id, type, asset_symbol, amount, status, reason)
               VALUES ($1, 'BONUS', $2, $3, 'COMPLETED', $4)`,
              [row.user_id, m.bonus_asset, m.bonus_amount, `Trading milestone: ${m.label}`]
            );
          });
          console.log(`[matching-engine] milestone bonus awarded: user ${row.user_id} milestone "${m.label}" (claim #${claimNumber})`);
        } catch (err) {
          // Unique constraint hit means another sweep already claimed this one — safe to skip.
          console.error(`[matching-engine] failed to award milestone claim for user ${row.user_id}`, err);
        }
      }
    }
  }
}
