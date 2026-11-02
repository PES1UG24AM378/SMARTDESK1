// Rebuilds the whole database: DROP -> schema -> triggers -> routines -> views -> indexes -> seed -> roles.
// Run with:  npm run db:reset
// Uses ADMIN_DATABASE_URL (owner/superuser). Falls back to DATABASE_URL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error('Set ADMIN_DATABASE_URL (or DATABASE_URL) in .env.local'); process.exit(1); }

const files = ['schema.sql', 'triggers.sql', 'routines.sql', 'views.sql', 'indexes.sql', 'seed.sql'];
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  console.log('Dropping and recreating schema public ...');
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  for (const f of files) {
    process.stdout.write(`Running db/${f} ... `);
    await client.query(fs.readFileSync(path.join(root, 'db', f), 'utf8'));
    console.log('ok');
  }
  const pw = process.env.APP_DB_PASSWORD;
  if (pw) {
    if (!/^[A-Za-z0-9_.!@#%^*-]{8,}$/.test(pw)) throw new Error('APP_DB_PASSWORD has unsupported characters or is too short');
    process.stdout.write('Running db/roles.sql (restricted application role) ... ');
    await client.query(fs.readFileSync(path.join(root, 'db/roles.sql'), 'utf8').replaceAll('__APP_PASSWORD__', pw));
    console.log('ok');
  } else {
    console.log('APP_DB_PASSWORD not set: skipping the restricted application role (see README).');
  }
  const { rows } = await client.query(
    `SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM tickets) AS tickets,
            (SELECT COUNT(*) FROM sla_alerts) AS alerts`);
  console.log('Done:', rows[0]);
  console.log('Next: npm run embed   (creates the search vectors for the seeded tickets)');
} finally {
  await client.end();
}
