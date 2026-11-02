// Index evidence on generated data (the 120 seed tickets are too few to show any effect).
//   1) B-tree indexes on a 200,000-row copy of the ticket columns the dashboards filter on
//   2) HNSW vector index on 20,000 random 384-dimension vectors
// These are PERFORMANCE tests, not accuracy tests. Temporary tables are dropped afterwards.
// Run: npm run perf   -> also writes docs/performance_results.md
import fs from 'node:fs';
import pg from 'pg';

const c = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL });
await c.connect();
const out = [];
const log = (s = '') => { console.log(s); out.push(s); };
async function explain(sql) {
  const rows = (await c.query('EXPLAIN (ANALYZE, TIMING ON) ' + sql)).rows.map((r) => r['QUERY PLAN']);
  const ms = Number(rows.find((l) => l.includes('Execution Time')).match(/([\d.]+) ms/)[1]);
  const node = rows.find((l) => /Scan|Sort/.test(l)).trim().replace(/\s*\(cost.*$/, '');
  return { ms, node };
}
const N = 200000, V = 20000;
try {
  log('# Performance results (generated data)\n');
  await c.query(`DROP TABLE IF EXISTS perf_tickets; DROP TABLE IF EXISTS perf_vectors;`);
  await c.query(`CREATE TABLE perf_tickets AS
    SELECT g AS ticket_id, (ARRAY['Open','In Progress','Resolved'])[1 + (random()*2)::int] AS status,
           (ARRAY['Critical','High','Medium','Low'])[1 + (random()*3)::int] AS priority,
           1 + (random()*6)::int AS dept_id, 1 + (random()*19)::int AS user_id,
           now() - (random() * interval '180 days') AS created_at
    FROM generate_series(1, ${N}) g`);
  await c.query('ANALYZE perf_tickets');
  log(`## 1. B-tree indexes on ${N.toLocaleString()} generated tickets\n`);
  log('| Query | Without index | With index | Plan with index |');
  log('|---|---|---|---|');
  const qs = [
    ['Last 20 open tickets (status filter, newest first)', `SELECT ticket_id FROM perf_tickets WHERE status = 'Open' ORDER BY created_at DESC LIMIT 20`, 'CREATE INDEX perf_idx_status_created ON perf_tickets (status, created_at DESC)'],
    ['One employee\'s recent tickets', `SELECT ticket_id FROM perf_tickets WHERE user_id = 7 ORDER BY created_at DESC LIMIT 20`, 'CREATE INDEX perf_idx_user_created ON perf_tickets (user_id, created_at DESC)'],
    ['High priority tickets in one department', `SELECT COUNT(*) FROM perf_tickets WHERE priority = 'Critical' AND dept_id = 3 AND status <> 'Resolved'`, 'CREATE INDEX perf_idx_prio_dept ON perf_tickets (priority, dept_id)'],
  ];
  for (const [name, sql, ddl] of qs) {
    const before = await explain(sql);
    await c.query(ddl); await c.query('ANALYZE perf_tickets');
    const after = await explain(sql);
    log(`| ${name} | ${before.ms.toFixed(2)} ms (${before.node.replace(/\|/g, '/')}) | ${after.ms.toFixed(2)} ms | ${after.node.replace(/\|/g, '/')} |`);
  }

  log(`\n## 2. HNSW vector index on ${V.toLocaleString()} generated 384-dimension vectors (50 clusters, like real text embeddings)\n`);
  await c.query(`DROP TABLE IF EXISTS perf_centers`);
  await c.query(`CREATE TABLE perf_centers AS SELECT g AS cid, (SELECT array_agg(random()::real - 0.5) FROM generate_series(1, 384)) AS c FROM generate_series(1, 50) g`);
  await c.query(`CREATE TABLE perf_vectors AS
    SELECT g AS id, (SELECT array_agg((pc.c[i] + 0.3 * (random() - 0.5))::real ORDER BY i) FROM generate_series(1, 384) i)::vector(384) AS embedding
    FROM generate_series(1, ${V}) g JOIN perf_centers pc ON pc.cid = 1 + (g % 50)`);
  await c.query('ANALYZE perf_vectors');
  const probes = Array.from({ length: 20 }, (_, i) => 1 + i * 997);
  const vecOf = async (id) => (await c.query('SELECT embedding::text AS v FROM perf_vectors WHERE id = $1', [id])).rows[0].v;
  const sqlFor = (v) => `SELECT id FROM perf_vectors ORDER BY embedding <=> '${v}'::vector LIMIT 5`;
  const exactIds = [];
  for (const id of probes) exactIds.push((await c.query(sqlFor(await vecOf(id)))).rows.map((r) => r.id));
  const sampleSql = sqlFor(await vecOf(probes[0]));
  const exact = await explain(sampleSql);
  const t0 = Date.now();
  await c.query('CREATE INDEX perf_hnsw ON perf_vectors USING hnsw (embedding vector_cosine_ops)');
  const buildMs = Date.now() - t0;
  await c.query('ANALYZE perf_vectors');
  const approx = await explain(sampleSql);
  let hit = 0;
  for (let i = 0; i < probes.length; i++) {
    const ids = (await c.query(sqlFor(await vecOf(probes[i])))).rows.map((r) => r.id);
    hit += ids.filter((x) => exactIds[i].includes(x)).length;
  }
  log('| Search | Time (one query) | Plan |');
  log('|---|---|---|');
  log(`| Exact (no index) | ${exact.ms.toFixed(2)} ms | ${exact.node} |`);
  log(`| HNSW index | ${approx.ms.toFixed(2)} ms | ${approx.node} |`);
  log(`\nIndex build time: ${(buildMs / 1000).toFixed(1)} s. Average recall@5 over ${probes.length} queries: ${(100 * hit / (5 * probes.length)).toFixed(0)}% (the share of the exact 5 nearest neighbours that HNSW also returned).`);
  log('\nNote: with only about 100 real tickets the planner correctly prefers an exact scan. The HNSW index pays off as the corpus grows. HNSW is approximate by design, and recall is lower on synthetic data where many neighbours are almost equally close; raising hnsw.ef_search trades speed for recall.');
} finally {
  await c.query('DROP TABLE IF EXISTS perf_tickets; DROP TABLE IF EXISTS perf_vectors; DROP TABLE IF EXISTS perf_centers;');
  await c.end();
}
fs.writeFileSync('docs/performance_results.md', out.join('\n') + '\n');
console.log('\nSaved docs/performance_results.md');
