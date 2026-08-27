import fs from 'fs';
import path from 'path';
import { pool } from './db';

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);

  for (const file of files) {
    const already = await pool.query('SELECT 1 FROM _migrations WHERE name = $1', [file]);
    if (already.rowCount && already.rowCount > 0) {
      console.log(`[migrate] skipping already-applied ${file}`);
      continue;
    }
    console.log(`[migrate] applying ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await pool.query(sql);
    await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
  }

  console.log('[migrate] done');
  await pool.end();
}

migrate().catch((err) => {
  console.error('[migrate] failed', err);
  process.exit(1);
});
