import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { pool, withTransaction } from '../db';
import { signToken, requireAuth } from '../middleware/auth';
import { config } from '../config';
import { generateReferralCode, applyRegistrationBonus, applyReferralBonus } from '../services/bonus';

const router = Router();
const googleClient = new OAuth2Client(config.googleClientId);

router.get('/me', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT id, email, role, is_merchant, (withdrawal_password_hash IS NOT NULL) AS has_withdrawal_password, created_at
     FROM users WHERE id = $1`,
    [req.user!.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ user: result.rows[0] });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.patch('/password', requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { currentPassword, newPassword } = parsed.data;

  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
  const existingHash = result.rows[0]?.password_hash;
  // A Google-signed-in account has no password yet — treat this as setting one for the
  // first time rather than requiring a "current" password that was never set.
  const valid = existingHash ? await bcrypt.compare(currentPassword, existingHash) : true;
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [req.user!.id, newHash]);
  res.json({ ok: true });
});

const withdrawalPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  withdrawalPassword: z.string().min(6),
});

// The withdrawal (funds) password is a second, separate credential required to authorize
// withdrawals and P2P releases, distinct from the login password.
router.post('/withdrawal-password', requireAuth, async (req, res) => {
  const parsed = withdrawalPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { currentPassword, withdrawalPassword } = parsed.data;

  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
  const existingHash = result.rows[0]?.password_hash;
  const valid = existingHash ? await bcrypt.compare(currentPassword, existingHash) : true;
  if (!valid) return res.status(401).json({ error: 'Current login password is incorrect' });

  const hash = await bcrypt.hash(withdrawalPassword, 10);
  await pool.query('UPDATE users SET withdrawal_password_hash = $2, updated_at = now() WHERE id = $1', [req.user!.id, hash]);
  res.json({ ok: true });
});

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = credsSchema.extend({
  referralCode: z.string().max(20).optional(),
});

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, referralCode } = parsed.data;

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount && existing.rowCount > 0) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await withTransaction(async (client) => {
    const userRes = await client.query(
      `INSERT INTO users (email, password_hash, role, referral_code) VALUES ($1, $2, 'USER', $3) RETURNING id, email, role, referral_code`,
      [email, passwordHash, generateReferralCode()]
    );
    const newUser = userRes.rows[0];

    // Seed starting paper-trading balance so new users can trade immediately.
    await client.query(
      `INSERT INTO user_balances (user_id, asset_symbol, available_balance, locked_balance)
       VALUES ($1, $2, $3, 0)`,
      [newUser.id, config.fiatSymbol, config.startingFiatBalance]
    );

    await applyRegistrationBonus(client, newUser.id);

    if (referralCode) {
      const referrerRes = await client.query('SELECT id FROM users WHERE referral_code = $1', [referralCode.toUpperCase()]);
      const referrer = referrerRes.rows[0];
      if (referrer && referrer.id !== newUser.id) {
        const cfg = await applyReferralBonus(client, referrer.id, newUser.id);
        await client.query(
          `INSERT INTO referrals (referrer_id, referred_user_id, referrer_bonus_amount, referee_bonus_amount, asset_symbol)
           VALUES ($1, $2, $3, $4, $5)`,
          [referrer.id, newUser.id, cfg?.referrer_bonus_amount ?? null, cfg?.referee_bonus_amount ?? null, cfg?.asset_symbol ?? null]
        );
      }
    }

    return newUser;
  });

  const token = signToken({ id: user.id, email: user.email, role: user.role });
  res.status(201).json({ token, user });
});

router.post('/login', async (req, res) => {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;

  const result = await pool.query('SELECT id, email, role, password_hash, is_frozen FROM users WHERE email = $1', [email]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (!user.password_hash) {
    return res.status(401).json({ error: 'This account signs in with Google — use "Continue with Google" instead' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.is_frozen) return res.status(403).json({ error: 'This account has been frozen. Contact support.' });

  const token = signToken({ id: user.id, email: user.email, role: user.role });
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});

const googleAuthSchema = z.object({
  credential: z.string().min(1),
  referralCode: z.string().max(20).optional(),
});

// "Sign in with Google" — the frontend uses Google Identity Services to get a signed ID
// token directly from Google, which we verify here (no OAuth redirect flow, no client
// secret needed). First sign-in for a new email creates the account exactly like
// /register; a matching existing email gets the Google identity linked onto it.
router.post('/google', async (req, res) => {
  if (!config.googleClientId) return res.status(503).json({ error: 'Google sign-in is not configured' });

  const parsed = googleAuthSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { credential, referralCode } = parsed.data;

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: config.googleClientId });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Invalid Google credential' });
  }
  if (!payload?.sub || !payload.email || !payload.email_verified) {
    return res.status(401).json({ error: 'Google account email is not verified' });
  }
  const googleId = payload.sub;
  const email = payload.email;

  const user = await withTransaction(async (client) => {
    const bySub = await client.query('SELECT id, email, role, is_frozen FROM users WHERE google_id = $1', [googleId]);
    if (bySub.rows[0]) return bySub.rows[0];

    const byEmail = await client.query('SELECT id, email, role, is_frozen FROM users WHERE email = $1', [email]);
    if (byEmail.rows[0]) {
      await client.query('UPDATE users SET google_id = $2, updated_at = now() WHERE id = $1', [byEmail.rows[0].id, googleId]);
      return byEmail.rows[0];
    }

    const userRes = await client.query(
      `INSERT INTO users (email, password_hash, role, referral_code, google_id)
       VALUES ($1, NULL, 'USER', $2, $3) RETURNING id, email, role, is_frozen`,
      [email, generateReferralCode(), googleId]
    );
    const newUser = userRes.rows[0];

    await client.query(
      `INSERT INTO user_balances (user_id, asset_symbol, available_balance, locked_balance) VALUES ($1, $2, $3, 0)`,
      [newUser.id, config.fiatSymbol, config.startingFiatBalance]
    );
    await applyRegistrationBonus(client, newUser.id);

    if (referralCode) {
      const referrerRes = await client.query('SELECT id FROM users WHERE referral_code = $1', [referralCode.toUpperCase()]);
      const referrer = referrerRes.rows[0];
      if (referrer && referrer.id !== newUser.id) {
        const cfg = await applyReferralBonus(client, referrer.id, newUser.id);
        await client.query(
          `INSERT INTO referrals (referrer_id, referred_user_id, referrer_bonus_amount, referee_bonus_amount, asset_symbol)
           VALUES ($1, $2, $3, $4, $5)`,
          [referrer.id, newUser.id, cfg?.referrer_bonus_amount ?? null, cfg?.referee_bonus_amount ?? null, cfg?.asset_symbol ?? null]
        );
      }
    }

    return newUser;
  });

  if (user.is_frozen) return res.status(403).json({ error: 'This account has been frozen. Contact support.' });

  const token = signToken({ id: user.id, email: user.email, role: user.role });
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});

export default router;
