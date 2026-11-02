// Run safe incremental migrations
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error('Set ADMIN_DATABASE_URL or DATABASE_URL in .env.local'); process.exit(1); }

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  console.log('Applying safe incremental migration: 001_add_unassigned_reason.sql ...');
  const sql = fs.readFileSync(path.join(root, 'db', 'migrations', '001_add_unassigned_reason.sql'), 'utf8');
  await client.query(sql);
  console.log('Migration applied successfully.');
} catch (err) {
  console.error('Migration error:', err);
  process.exit(1);
} finally {
  await client.end();
}
