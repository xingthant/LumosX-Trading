import { PoolClient } from 'pg';

export class InsufficientBalanceError extends Error {
  constructor(asset: string) {
    super(`Insufficient available balance in ${asset}`);
    this.name = 'InsufficientBalanceError';
  }
}

async function ensureBalanceRow(client: PoolClient, userId: string, asset: string) {
  await client.query(
    `INSERT INTO user_balances (user_id, asset_symbol, available_balance, locked_balance)
     VALUES ($1, $2, 0, 0)
     ON CONFLICT (user_id, asset_symbol) DO NOTHING`,
    [userId, asset]
  );
}

/** Permanently deducts from locked_balance (order fill on the spent side). */
export async function deductLocked(client: PoolClient, userId: string, asset: string, amount: number) {
  await ensureBalanceRow(client, userId, asset);
  const res = await client.query(
    `UPDATE user_balances
     SET locked_balance = locked_balance - $3,
         updated_at = now()
     WHERE user_id = $1 AND asset_symbol = $2 AND locked_balance >= $3
     RETURNING *`,
    [userId, asset, amount]
  );
  if (res.rowCount === 0) {
    throw new InsufficientBalanceError(asset);
  }
  return res.rows[0];
}

/** Credits available_balance directly (order fill on the received side). */
export async function creditAvailable(client: PoolClient, userId: string, asset: string, amount: number) {
  await ensureBalanceRow(client, userId, asset);
  const res = await client.query(
    `UPDATE user_balances
     SET available_balance = available_balance + $3,
         updated_at = now()
     WHERE user_id = $1 AND asset_symbol = $2
     RETURNING *`,
    [userId, asset, amount]
  );
  return res.rows[0];
}

/** Returns previously locked funds back to available_balance (short-term trade push/refund). */
export async function unlockFunds(client: PoolClient, userId: string, asset: string, amount: number) {
  await ensureBalanceRow(client, userId, asset);
  const res = await client.query(
    `UPDATE user_balances
     SET available_balance = available_balance + $3,
         locked_balance = locked_balance - $3,
         updated_at = now()
     WHERE user_id = $1 AND asset_symbol = $2 AND locked_balance >= $3
     RETURNING *`,
    [userId, asset, amount]
  );
  if (res.rowCount === 0) {
    throw new InsufficientBalanceError(asset);
  }
  return res.rows[0];
}
