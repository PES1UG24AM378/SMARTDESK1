// Creates the search vectors (embeddings) for every ticket that has none yet.
// Run once after `npm run db:reset`. The first run with the default MiniLM model
// downloads the model (needs internet); later runs use the local cache.
import { query, getPool } from '../lib/db.js';
import { getEmbedding, provider } from '../lib/embeddings.js';
import { formatVector } from '../lib/similarity.js';

const { rows } = await query('SELECT ticket_id, description FROM tickets WHERE embedding IS NULL ORDER BY ticket_id');
console.log(`Embedding ${rows.length} tickets with provider "${provider()}" ...`);
let n = 0;
for (const r of rows) {
  const vec = formatVector(await getEmbedding(r.description));
  await query('UPDATE tickets SET embedding = $2::vector WHERE ticket_id = $1', [r.ticket_id, vec]);
  if (++n % 20 === 0) console.log(`  ${n}/${rows.length}`);
}
console.log(`Done: ${n} tickets embedded.`);
await getPool().end();
