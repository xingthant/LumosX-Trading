import crypto from 'crypto';
import { PoolClient } from 'pg';
import { creditAvailable } from './ledger';

export function generateReferralCode(): string {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

/** Credits the platform's configured signup bonus, if one is currently active. */
export async function applyRegistrationBonus(client: PoolClient, userId: string) {
  const result = await client.query(
    `SELECT * FROM registration_bonus_config WHERE is_active = true ORDER BY updated_at DESC LIMIT 1`
  );
  const cfg = result.rows[0];
  if (!cfg) return null;

  const amount = parseFloat(cfg.amount);
  await creditAvailable(client, userId, cfg.asset_symbol, amount);
  await client.query(
    `INSERT INTO transactions (user_id, type, asset_symbol, amount, status, reason)
     VALUES ($1, 'BONUS', $2, $3, 'COMPLETED', 'Registration bonus')`,
    [userId, cfg.asset_symbol, amount]
  );
  return cfg;
}

/** Credits both sides of an active referral program when a new user signs up with a code. */
export async function applyReferralBonus(client: PoolClient, referrerId: string, refereeId: string) {
  const result = await client.query(
    `SELECT * FROM referral_program_config WHERE is_active = true ORDER BY updated_at DESC LIMIT 1`
  );
  const cfg = result.rows[0];
  if (!cfg) return null;

  const referrerAmount = parseFloat(cfg.referrer_bonus_amount);
  const refereeAmount = parseFloat(cfg.referee_bonus_amount);

  if (referrerAmount > 0) {
    await creditAvailable(client, referrerId, cfg.asset_symbol, referrerAmount);
    await client.query(
      `INSERT INTO transactions (user_id, type, asset_symbol, amount, status, reason)
       VALUES ($1, 'BONUS', $2, $3, 'COMPLETED', 'Referral bonus (referrer)')`,
      [referrerId, cfg.asset_symbol, referrerAmount]
    );
  }
  if (refereeAmount > 0) {
    await creditAvailable(client, refereeId, cfg.asset_symbol, refereeAmount);
    await client.query(
      `INSERT INTO transactions (user_id, type, asset_symbol, amount, status, reason)
       VALUES ($1, 'BONUS', $2, $3, 'COMPLETED', 'Referral bonus (referred)')`,
      [refereeId, cfg.asset_symbol, refereeAmount]
    );
  }
  return cfg;
}
