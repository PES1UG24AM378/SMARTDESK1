// Proves why assign_technician takes an advisory lock.
//  A) the REAL procedure, 40 parallel submissions            -> technician loads end up balanced
//  B) a copy WITHOUT the lock (with a small delay)           -> the race shows: loads become uneven
//  C) a copy WITH the lock (same delay)                      -> balanced again
// All test tickets are removed afterwards. Run: npm run test:concurrency
import pg from 'pg';

const url = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString: url, max: 45 });
const DEPT = 1;     // IT Network has two technicians
const N = 40;

const body = (lock) => `
CREATE OR REPLACE PROCEDURE ${lock ? 'assign_locked_test' : 'assign_nolock_test'}(p_ticket_id INT, INOUT p_tech_id INT)
LANGUAGE plpgsql AS $$
DECLARE v_dept INT;
BEGIN
  SELECT dept_id INTO v_dept FROM tickets WHERE ticket_id = p_ticket_id;
  ${lock ? 'PERFORM pg_advisory_xact_lock(4001, v_dept);' : ''}
  SELECT t.tech_id INTO p_tech_id FROM technicians t
    LEFT JOIN tickets k ON k.tech_id = t.tech_id AND k.status <> 'Resolved'
   WHERE t.dept_id = v_dept GROUP BY t.tech_id ORDER BY COUNT(k.ticket_id), t.tech_id LIMIT 1;
  PERFORM pg_sleep(0.05);          -- widens the window in which a race can happen
  UPDATE tickets SET tech_id = p_tech_id WHERE ticket_id = p_ticket_id;
END $$;`;

async function load() {
  const { rows } = await pool.query(`SELECT t.tech_id, COUNT(k.ticket_id)::int AS n FROM technicians t
      LEFT JOIN tickets k ON k.tech_id = t.tech_id AND k.status <> 'Resolved' WHERE t.dept_id = $1 GROUP BY t.tech_id ORDER BY t.tech_id`, [DEPT]);
  return rows.map((r) => r.n);
}

async function run(proc) {
  const before = await load();
  const ids = [];
  await Promise.all(Array.from({ length: N }, async (_, i) => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const t = await c.query(`INSERT INTO tickets (user_id, dept_id, description, priority) VALUES (11, $1, $2, 'Low') RETURNING ticket_id`, [DEPT, `concurrency test ticket ${i}`]);
      ids.push(t.rows[0].ticket_id);
      await c.query(`CALL ${proc}($1, NULL)`, [t.rows[0].ticket_id]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); console.error(e.message); } finally { c.release(); }
  }));
  const after = await load();
  await pool.query('DELETE FROM tickets WHERE ticket_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM ticket_deletions WHERE ticket_id = ANY($1)', [ids]);
  return { before, after, spread: Math.max(...after) - Math.min(...after) };
}

await pool.query(body(false)); await pool.query(body(true));
let ok = true;
try {
  const a = await run('assign_technician');
  console.log(`A) real assign_technician, ${N} parallel : loads ${a.before} -> ${a.after}, spread ${a.spread}`);
  const b = await run('assign_nolock_test');
  console.log(`B) copy WITHOUT lock (with delay)        : loads ${b.before} -> ${b.after}, spread ${b.spread}`);
  const c = await run('assign_locked_test');
  console.log(`C) copy WITH lock (with delay)           : loads ${c.before} -> ${c.after}, spread ${c.spread}`);
  const aOk = a.spread <= 1, bOk = b.spread > 1, cOk = c.spread <= 1;
  console.log(`\nreal procedure balanced (spread <= 1): ${aOk ? 'PASS' : 'FAIL'}`);
  console.log(`race visible without the lock (spread > 1): ${bOk ? 'PASS' : 'FAIL'}`);
  console.log(`lock removes the race (spread <= 1): ${cOk ? 'PASS' : 'FAIL'}`);
  ok = aOk && bOk && cOk;
} finally {
  await pool.query('DROP PROCEDURE IF EXISTS assign_nolock_test(INT, INT)');
  await pool.query('DROP PROCEDURE IF EXISTS assign_locked_test(INT, INT)');
  await pool.end();
}
process.exit(ok ? 0 : 1);
