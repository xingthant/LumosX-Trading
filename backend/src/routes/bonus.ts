import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { pool } from '../db';

const router = Router();
router.use(requireAuth);

router.get('/me', async (req, res) => {
  const userRes = await pool.query('SELECT referral_code FROM users WHERE id = $1', [req.user!.id]);
  const referralCode = userRes.rows[0]?.referral_code;

  const referred = await pool.query(
    `SELECT u.email, r.referrer_bonus_amount, r.asset_symbol, r.created_at
     FROM referrals r JOIN users u ON u.id = r.referred_user_id
     WHERE r.referrer_id = $1 ORDER BY r.created_at DESC`,
    [req.user!.id]
  );
  const totalEarned = referred.rows.reduce((sum, r) => sum + parseFloat(r.referrer_bonus_amount || 0), 0);

  const volumeRes = await pool.query(
    `SELECT
       COALESCE((SELECT SUM(filled_amount * price) FROM orders WHERE user_id = $1 AND status IN ('FILLED','PARTIALLY_FILLED') AND price IS NOT NULL), 0)
       + COALESCE((SELECT SUM(stake_amount) FROM short_term_trades WHERE user_id = $1), 0) AS volume`,
    [req.user!.id]
  );
  const volume = parseFloat(volumeRes.rows[0].volume);

  const milestones = await pool.query(
    `SELECT m.*, COALESCE(c.claimed_count, 0) AS claimed_count, COALESCE(c.total_claimed, 0) AS total_claimed
     FROM trading_milestones m
     LEFT JOIN (
       SELECT milestone_id, COUNT(*) AS claimed_count, SUM(bonus_amount) AS total_claimed
       FROM user_milestone_claims WHERE user_id = $1 GROUP BY milestone_id
     ) c ON c.milestone_id = m.id
     WHERE m.is_active = true
     ORDER BY m.target_volume ASC`,
    [req.user!.id]
  );

  res.json({
    referralCode,
    referredUsers: referred.rows,
    referralEarned: totalEarned,
    tradingVolume: volume,
    milestones: milestones.rows,
  });
});

export default router;
