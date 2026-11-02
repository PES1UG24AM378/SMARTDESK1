// Verification script for SmartDesk improvements:
// 1. Employee ticket creation
// 2. Automatic routing & technician assignment (least open tickets)
// 3. Department with NO eligible active technician -> unassigned with NO_ACTIVE_TECHNICIAN
// 4. Low-confidence/uncertain routing -> goes to Triage with TRIAGE_REQUIRED
// 5. Admin manual assignment & reassignment
// 6. SLA scan with overdue ticket & idempotency check (no duplicate alerts)
// 7. Resolved ticket doesn't generate overdue alerts
// 8. Security checks: unauthorized endpoints blocked (401/403)
import pg from 'pg';

const BASE = process.env.APP_URL || 'http://localhost:3000';
const PASSWORD = 'Password@123';
const pool = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL });

const results = [];
function check(name, pass, detail = '') {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' -> ' + detail : ''}`);
}

class Session {
  constructor() { this.cookie = ''; }
  async call(method, path, body, headers = {}) {
    const res = await fetch(BASE + path, {
      method, redirect: 'manual',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    let data = null; try { data = await res.json(); } catch {}
    return { status: res.status, data, setCookie: set };
  }
  async login(email, password = PASSWORD) { return this.call('POST', '/api/auth/login', { email, password }); }
}

const emp = new Session();
await emp.login('aarav.sharma@smartdesk.example');

const admin = new Session();
await admin.login('admin1@smartdesk.example');

console.log('--- Verifying SmartDesk Improvements ---\n');

// 1. Employee ticket creation with automatic technician assignment
const t1 = await emp.call('POST', '/api/tickets', {
  description: `Network switch failure on fourth floor east wing ${Date.now()}`,
  priority: 'High',
});
check('Employee creates ticket (201)', t1.status === 201, `#${t1.data?.ticket_id}`);
check('Ticket automatically routed and assigned to active technician',
  !!t1.data?.technician && t1.data?.department?.name === 'IT Network',
  `tech: ${t1.data?.technician}`);

// 2. Test department with NO active technician
// Temporarily deactivate technicians in department 6 (Plumbing & Civil, tech_id 8)
const tech8User = (await pool.query('SELECT user_id FROM technicians WHERE tech_id = 8')).rows[0].user_id;
await pool.query('UPDATE users SET is_active = false WHERE user_id = $1', [tech8User]);

const t2 = await emp.call('POST', '/api/tickets', {
  description: `Water pipe burst flooding the third floor restroom ${Date.now()}`,
  priority: 'Critical',
});
check('Ticket submitted for department with no active tech stays open and unassigned',
  t2.status === 201 && t2.data?.technician === null,
  `dept: ${t2.data?.department?.name}, tech: ${t2.data?.technician}`);
check('Unassigned ticket records NO_ACTIVE_TECHNICIAN reason',
  t2.data?.unassigned_reason === 'NO_ACTIVE_TECHNICIAN',
  `reason: ${t2.data?.unassigned_reason}`);

// Restore technician 8
await pool.query('UPDATE users SET is_active = true WHERE user_id = $1', [tech8User]);

// 3. Test uncertain routing goes to Triage
const t3 = await emp.call('POST', '/api/tickets', {
  description: `Quantum paradox in hyperspace widget xyz987654321 ${Date.now()}`,
  priority: 'Low',
});
check('Uncertain ticket routes to Triage queue',
  t3.status === 201 && t3.data?.department?.name === 'Triage' && t3.data?.mode === 'triage',
  `dept: ${t3.data?.department?.name}, mode: ${t3.data?.mode}`);
check('Triage ticket records triage reason',
  t3.data?.unassigned_reason !== null && t3.data?.technician === null,
  `reason: ${t3.data?.unassigned_reason}`);

// 4. Test admin manual assignment & reassignment
const itDept = (await pool.query("SELECT dept_id FROM departments WHERE name = 'IT Network'")).rows[0].dept_id;
const itTech = (await pool.query("SELECT tech_id FROM technicians WHERE dept_id = $1 LIMIT 1", [itDept])).rows[0].tech_id;
const reassignRes = await admin.call('PATCH', `/api/admin/tickets/${t3.data.ticket_id}/assign`, {
  action: 'reassign',
  dept_id: itDept,
  tech_id: itTech,
});
check('Admin manually routes triage ticket to IT Network with specific technician (200)',
  reassignRes.status === 200 && reassignRes.data?.tech_id === itTech,
  `tech_id: ${reassignRes.data?.tech_id}`);

// Verify unassigned reason is cleared
const updatedTicket = (await admin.call('GET', `/api/tickets/${t3.data.ticket_id}`)).data;
check('Assigned ticket has unassigned_reason cleared',
  updatedTicket.ticket.unassigned_reason === null && !!updatedTicket.ticket.technician,
  `tech: ${updatedTicket.ticket.technician}`);

// 5. Test SLA scan with overdue ticket & idempotency
// Create an overdue ticket fixture in DB (disabling breach trigger to simulate untouched ticket where time passed)
await pool.query('ALTER TABLE tickets DISABLE TRIGGER trg_sla_breach_alert');
const overdueRes = await pool.query(
  `INSERT INTO tickets (user_id, dept_id, description, priority, status, created_at, sla_deadline)
   VALUES (11, 1, 'Simulated overdue ticket for SLA scan test', 'Critical', 'Open', now() - INTERVAL '5 hours', now() - INTERVAL '1 hour')
   RETURNING ticket_id`
);
await pool.query('ALTER TABLE tickets ENABLE TRIGGER trg_sla_breach_alert');
const overdueId = overdueRes.rows[0].ticket_id;

// Run scan first time
const scan1 = await admin.call('POST', '/api/admin/sla-scan');
check('SLA scan runs and detects overdue ticket (200)', scan1.status === 200 && scan1.data?.newAlerts >= 1, `newAlerts: ${scan1.data?.newAlerts}`);

// Run scan second time - must be idempotent (0 new alerts)
const scan2 = await admin.call('POST', '/api/admin/sla-scan');
check('Repeated SLA scan is idempotent (0 duplicate alerts generated)', scan2.status === 200 && scan2.data?.newAlerts === 0, `newAlerts: ${scan2.data?.newAlerts}`);

// 6. Test resolved tickets do not generate overdue alerts
await pool.query(
  `UPDATE tickets SET status = 'Resolved', resolution_text = 'Fixed simulated overdue issue with verified repair', resolved_at = now() - INTERVAL '30 minutes'
   WHERE ticket_id = $1`, [overdueId]
);
// Delete alert for this ticket to verify scanning won't re-create it for a resolved ticket
await pool.query(`DELETE FROM sla_alerts WHERE ticket_id = $1`, [overdueId]);
const scan3 = await admin.call('POST', '/api/admin/sla-scan');
const alertCheck = await pool.query(`SELECT COUNT(*)::int AS n FROM sla_alerts WHERE ticket_id = $1 AND alert_type = 'Active Exceeded'`, [overdueId]);
check('Resolved overdue ticket does not generate Active Exceeded alert during scan', alertCheck.rows[0].n === 0);

// Cleanup test fixture
await pool.query(`DELETE FROM tickets WHERE ticket_id = $1`, [overdueId]);

// 7. Security: Unauthorized requests
const anon = new Session();
const anonScan = await anon.call('POST', '/api/admin/sla-scan');
check('Unauthenticated request to SLA scan is refused (401)', anonScan.status === 401);

const empScan = await emp.call('POST', '/api/admin/sla-scan');
check('Employee request to SLA scan is refused (403)', empScan.status === 403);

const badCronScan = await anon.call('POST', '/api/admin/sla-scan', null, { 'x-cron-secret': 'invalid_secret' });
check('Invalid cron secret is refused (401)', badCronScan.status === 401);

const validCronScan = await anon.call('POST', '/api/admin/sla-scan', null, { 'x-cron-secret': process.env.CRON_SECRET });
check('Valid cron secret is accepted without user session (200)', validCronScan.status === 200);

const empAssign = await emp.call('PATCH', `/api/admin/tickets/${t1.data.ticket_id}/assign`, {
  action: 'reassign',
  dept_id: itDept,
});
check('Employee cannot assign or reassign tickets (403)', empAssign.status === 403);

// Clean up tickets created in this test
await pool.query(`DELETE FROM tickets WHERE ticket_id IN ($1, $2, $3)`, [t1.data.ticket_id, t2.data.ticket_id, t3.data.ticket_id]);
await pool.end();

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} improvement verification checks passed.`);
process.exit(passed === results.length ? 0 : 1);
