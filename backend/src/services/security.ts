import bcrypt from 'bcryptjs';
import { pool } from '../db';

export class WithdrawalPasswordError extends Error {}

/** Verifies the funds/withdrawal password for a user, distinct from their login password. */
export async function verifyWithdrawalPassword(userId: string, suppliedPassword: string | undefined): Promise<void> {
  const result = await pool.query('SELECT withdrawal_password_hash FROM users WHERE id = $1', [userId]);
  const hash = result.rows[0]?.withdrawal_password_hash;

  if (!hash) {
    throw new WithdrawalPasswordError('Set a withdrawal password in Settings before withdrawing funds');
  }
  if (!suppliedPassword) {
    throw new WithdrawalPasswordError('Withdrawal password is required');
  }
  const valid = await bcrypt.compare(suppliedPassword, hash);
  if (!valid) {
    throw new WithdrawalPasswordError('Incorrect withdrawal password');
  }
}
