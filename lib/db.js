// PostgreSQL connection pool and transaction helper.
import pg from 'pg';

function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example)');
  const local = /localhost|127\.0\.0\.1/.test(url);
  // Hosted databases usually need TLS; for a real deployment use a proper CA instead.
  return new pg.Pool({ connectionString: url, max: 10, ssl: local ? false : { rejectUnauthorized: false } });
}

export function getPool() {
  globalThis._sdPool ??= makePool();       // survive Next.js hot reloads
  return globalThis._sdPool;
}

export const query = (text, params) => getPool().query(text, params);

/**
 * Runs fn(client) inside ONE transaction. The acting user id is stored in the
 * transaction-local setting app.user_id so triggers can record who made a change.
 */
export async function withTransaction(userId, fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id', $1, true)", [String(userId ?? '')]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
