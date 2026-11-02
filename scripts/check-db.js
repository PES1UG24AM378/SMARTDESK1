// Database-level tests: constraints, triggers, procedures, views and indexes.
// Everything runs inside one transaction that is rolled back, so the data is untouched.
// Run: npm run test:db
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL });
await client.connect();
const results = [];
const pass = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); };

async function expectError(name, sql, params, code, constraint) {
  await client.query('SAVEPOINT s');
  try {
    await client.query(sql, params);
    pass(name, false, 'statement was accepted');
  } catch (e) {
    const ok = e.code === code && (!constraint || e.constraint === constraint);
    pass(name, ok, `${e.code} ${e.constraint || e.message.slice(0, 60)}`);
  }
  await client.query('ROLLBACK TO SAVEPOINT s');
}
const one = async (sql, params) => (await client.query(sql, params)).rows[0];

await client.query('BEGIN');
try {
  await client.query("SELECT set_config('app.user_id', '11', true)");

  // ---- validation at the database level -------------------------------
  await expectError('rejects a too-short description',
    `INSERT INTO tickets (user_id, dept_id, description, priority) VALUES (11, 1, 'short', 'Low')`, [], '23514', 'chk_ticket_description');
  await expectError('rejects Resolved without a resolution',
    `INSERT INTO tickets (user_id, dept_id, description, priority, status, resolved_at) VALUES (11, 1, 'Network is down in lab', 'Low', 'Resolved', now())`, [], '23514');
  await expectError('rejects an invalid status',
    `INSERT INTO tickets (user_id, dept_id, description, priority, status) VALUES (11, 1, 'Network is down in lab', 'Low', 'Done')`, [], '23514', 'chk_ticket_status');
  await expectError('rejects an unknown priority (foreign key)',
    `INSERT INTO tickets (user_id, dept_id, description, priority) VALUES (11, 1, 'Network is down in lab', 'Urgent')`, [], '23503');
  await expectError('rejects a badly formatted email',
    `INSERT INTO users (name, email, password_hash, role) VALUES ('Test User', 'not-an-email', 'x', 'Employee')`, [], '23514', 'chk_users_email_format');
  await expectError('rejects a duplicate email',
    `INSERT INTO users (name, email, password_hash, role) VALUES ('Test User', 'admin1@smartdesk.example', 'x', 'Employee')`, [], '23505');
  await expectError('rejects a technician from another department (composite FK)',
    `INSERT INTO tickets (user_id, dept_id, tech_id, description, priority) VALUES (11, 4, 1, 'Light is not working in room', 'Low')`, [], '23503', 'fk_ticket_tech_dept');
  await expectError('rejects verified resolution on an open ticket',
    `INSERT INTO tickets (user_id, dept_id, description, priority, resolution_verified) VALUES (11, 1, 'Network is down in lab', 'Low', true)`, [], '23514', 'chk_ticket_verified');

  // ---- triggers ----------------------------------------------------------
  const t = await one(`INSERT INTO tickets (user_id, dept_id, description, priority) VALUES (11, 1, 'Wi-Fi is down on the second floor', 'High')
                       RETURNING ticket_id, created_at, sla_deadline`);
  const hours = (new Date(t.sla_deadline) - new Date(t.created_at)) / 3600000;
  pass('SLA trigger sets the deadline from the priority (High = 8 h)', Math.abs(hours - 8) < 0.001, `${hours} h`);

  const log1 = await one('SELECT COUNT(*)::int AS n, MAX(changed_by) AS by FROM ticket_status_log WHERE ticket_id = $1', [t.ticket_id]);
  pass('audit trigger logs the creation with the acting user', log1.n === 1 && log1.by === 11, `rows=${log1.n}, by=${log1.by}`);

  await client.query(`UPDATE tickets SET description = 'Wi-Fi is down on the second floor lab' WHERE ticket_id = $1`, [t.ticket_id]);
  const log2 = await one('SELECT COUNT(*)::int AS n FROM ticket_status_log WHERE ticket_id = $1', [t.ticket_id]);
  pass('audit trigger ignores updates that do not change the status', log2.n === 1);

  await client.query("SELECT set_config('app.user_id', '3', true)");
  await client.query(`UPDATE tickets SET status = 'In Progress' WHERE ticket_id = $1`, [t.ticket_id]);
  const log3 = await one(`SELECT COUNT(*)::int AS n, MAX(changed_by) AS by FROM ticket_status_log WHERE ticket_id = $1 AND new_status = 'In Progress'`, [t.ticket_id]);
  pass('audit trigger logs a status change with who changed it', log3.n === 1 && log3.by === 3);

  // resolved late -> alert
  await client.query(`UPDATE tickets SET created_at = now() - interval '30 hours', sla_deadline = now() - interval '22 hours' WHERE ticket_id = $1`, [t.ticket_id]);
  await client.query(`UPDATE tickets SET status = 'Resolved', resolution_text = 'Restarted the access point', resolved_at = now(), resolution_verified = true WHERE ticket_id = $1`, [t.ticket_id]);
  const al = await one(`SELECT COUNT(*)::int AS n FROM sla_alerts WHERE ticket_id = $1 AND alert_type = 'Resolved Late'`, [t.ticket_id]);
  pass('SLA breach trigger raises a "Resolved Late" alert', al.n === 1);

  // ---- stored procedures ----------------------------------------------------
  const t2 = await one(`INSERT INTO tickets (user_id, dept_id, description, priority) VALUES (12, 1, 'VPN will not connect from home', 'Medium') RETURNING ticket_id`);
  const a = await one('CALL assign_technician($1, NULL)', [t2.ticket_id]);
  const load = (await client.query(`SELECT t.tech_id, COUNT(k.ticket_id)::int AS n FROM technicians t LEFT JOIN tickets k ON k.tech_id = t.tech_id AND k.status <> 'Resolved' WHERE t.dept_id = 1 GROUP BY t.tech_id ORDER BY t.tech_id`)).rows;
  pass('assign_technician picks a technician of the right department', [1, 2].includes(a.p_tech_id), `tech ${a.p_tech_id}, loads ${JSON.stringify(load)}`);

  await client.query('SAVEPOINT s');
  try { await client.query(`CALL assign_technician($1, NULL)`, [999999]); pass('assign_technician rejects an unknown ticket', false); }
  catch (e) { pass('assign_technician rejects an unknown ticket', /not found/.test(e.message)); }
  await client.query('ROLLBACK TO SAVEPOINT s');

  await client.query('SAVEPOINT s');
  try { await client.query(`CALL escalate_ticket($1, 'Low')`, [t2.ticket_id]); pass('escalate_ticket refuses a lower priority', false); }
  catch (e) { pass('escalate_ticket refuses a lower priority', /not higher/.test(e.message)); }
  await client.query('ROLLBACK TO SAVEPOINT s');
  await client.query(`CALL escalate_ticket($1, 'Critical')`, [t2.ticket_id]);
  const esc = await one('SELECT priority, sla_deadline - now() AS left FROM tickets WHERE ticket_id = $1', [t2.ticket_id]);
  pass('escalate_ticket raises the priority and restarts the SLA clock', esc.priority === 'Critical' && esc.left.hours >= 3, `${esc.priority}, ${esc.left.hours}h left`);

  await client.query('ALTER TABLE tickets DISABLE TRIGGER trg_sla_breach_alert');   // simulate "time passed, nobody touched the row"
  await client.query(`UPDATE tickets SET sla_deadline = now() - interval '1 hour' WHERE ticket_id = $1`, [t2.ticket_id]);
  await client.query('ALTER TABLE tickets ENABLE TRIGGER trg_sla_breach_alert');
  const s1 = await one('CALL scan_and_alert_sla_breaches(NULL)');
  const s2 = await one('CALL scan_and_alert_sla_breaches(NULL)');
  pass('scheduled SLA scan finds an overdue untouched ticket and is idempotent', s1.p_new_alerts >= 1 && s2.p_new_alerts === 0, `first=${s1.p_new_alerts}, second=${s2.p_new_alerts}`);

  // ---- delete + deletion log ----------------------------------------------------
  const t3 = await one(`INSERT INTO tickets (user_id, dept_id, description, priority) VALUES (13, 5, 'AC is not cooling in room 12', 'Low') RETURNING ticket_id`);
  await client.query('DELETE FROM tickets WHERE ticket_id = $1', [t3.ticket_id]);
  const del = await one('SELECT COUNT(*)::int AS n FROM ticket_deletions WHERE ticket_id = $1', [t3.ticket_id]);
  const gone = await one('SELECT COUNT(*)::int AS n FROM tickets WHERE ticket_id = $1', [t3.ticket_id]);
  pass('DELETE removes the ticket and the trigger records it', del.n === 1 && gone.n === 0);

  // ---- views, search, indexes ---------------------------------------------------
  const totalTechs = (await one('SELECT COUNT(*)::int AS n FROM technicians')).n;
  const wl = await client.query('SELECT * FROM technician_workload');
  pass('view technician_workload returns every technician', wl.rows.length === totalTechs, `${wl.rows.length} rows`);
  const rs = await client.query('SELECT * FROM resolution_summary');
  pass('view resolution_summary returns every department', rs.rows.length === 7, `${rs.rows.length} rows`);

  const src = await one(`SELECT ticket_id FROM tickets WHERE status = 'Resolved' AND dept_id = 1 ORDER BY ticket_id LIMIT 1`);
  for (const u of [14, 15]) {
    const nt = await one(`INSERT INTO tickets (user_id, dept_id, description, priority) VALUES ($1, 1, 'Wi-Fi keeps dropping all the time', 'Low') RETURNING ticket_id`, [u]);
    await client.query(`INSERT INTO ticket_suggestions (ticket_id, source_ticket_id, mode, similarity, predicted_dept_id) VALUES ($1, $2, 'suggest', 0.9, 1)`, [nt.ticket_id, src.ticket_id]);
  }
  const rec = await client.query('SELECT * FROM recurring_issues');
  pass('view recurring_issues (GROUP BY ... HAVING) lists a fix suggested twice', rec.rows.length === 1 && rec.rows[0].times_suggested === 2);

  const fts = await client.query(`SELECT ticket_id FROM tickets WHERE search_tsv @@ websearch_to_tsquery('english', 'printer') LIMIT 5`);
  pass('full-text search finds tickets', fts.rows.length > 0, `${fts.rows.length} hits`);

  const emb = await one('SELECT COUNT(*)::int AS n FROM tickets WHERE embedding IS NOT NULL');
  if (emb.n > 0) {
    await client.query('SET LOCAL enable_seqscan = off');
    await client.query('SET LOCAL enable_bitmapscan = off');   // at ~100 rows the planner prefers an exact scan; this shows the index is usable
    const srcVec = (await one('SELECT embedding FROM tickets WHERE ticket_id = $1', [src.ticket_id])).embedding;
    const plan = (await client.query(`EXPLAIN SELECT ticket_id FROM tickets WHERE status = 'Resolved' AND resolution_verified AND embedding IS NOT NULL ORDER BY embedding <=> $1::vector LIMIT 5`, [srcVec])).rows.map((r) => r['QUERY PLAN']).join('\n');
    pass('similarity query can use the partial HNSW index (when alternatives are disabled)', /idx_tickets_embedding_resolved/.test(plan));
    await client.query('SET LOCAL enable_seqscan = on');
    await client.query('SET LOCAL enable_bitmapscan = on');
    const self = await one(`SELECT 1 - (embedding <=> embedding) AS s FROM tickets WHERE ticket_id = $1`, [src.ticket_id]);
    pass('cosine similarity of a vector with itself is 1', Math.abs(Number(self.s) - 1) < 1e-6);
  } else {
    console.log('SKIP  vector tests (run npm run embed first)');
  }
} finally {
  await client.query('ROLLBACK');
  await client.end();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} database tests passed`);
process.exit(failed.length ? 1 : 0);
