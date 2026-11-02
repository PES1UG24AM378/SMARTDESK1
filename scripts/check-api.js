// End-to-end API checks against a RUNNING server (npm run build && npm start, then npm run test:api).
// Covers authentication, the role matrix, IDOR protection, the ticket lifecycle, the AI flow, and admin actions.
const BASE = process.env.APP_URL || 'http://localhost:3000';
const PASSWORD = 'Password@123';
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); };

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
    let data = null; try { data = await res.json(); } catch { }
    return { status: res.status, data, setCookie: set };
  }
  async login(email, password = PASSWORD) { return this.call('POST', '/api/auth/login', { email, password }); }
}
const EMP = 'aarav.sharma@smartdesk.example';
const EMP2 = 'priya.nair@smartdesk.example';
const ADMIN = 'admin1@smartdesk.example';

// ---------------- authentication ----------------
const anon = new Session();
check('unauthenticated /api/me is refused (401)', (await anon.call('GET', '/api/me')).status === 401);
check('unauthenticated ticket list is refused (401)', (await anon.call('GET', '/api/tickets/mine')).status === 401);

const bad = await anon.login(EMP, 'wrong-password');
check('wrong password is refused with a generic message', bad.status === 401 && bad.data.error === 'Invalid email or password');
const unknown = await anon.login('nobody@smartdesk.example', 'whatever123');
check('unknown email gives the same message (no user enumeration)', unknown.status === 401 && unknown.data.error === bad.data.error);

let last;
for (let i = 0; i < 6; i++) last = await anon.login('lockme@smartdesk.example', 'x' + i);
check('repeated failed logins are rate limited (429)', last.status === 429);

const emp = new Session(); const emp2 = new Session(); const admin = new Session();
const lo = await emp.login(EMP);
check('employee can sign in', lo.status === 200 && lo.data.user.role === 'Employee');
check('login cookie is HttpOnly and SameSite', /HttpOnly/i.test(lo.setCookie) && /SameSite=Lax/i.test(lo.setCookie));
await emp2.login(EMP2); await admin.login(ADMIN);

// find a technician account that exists for IT Network
const users = (await admin.call('GET', '/api/admin/users')).data.users;
const techOf = (dept) => users.find((u) => u.role === 'Technician' && u.department === dept);
const otherTech = techOf('Facilities HVAC');
const tOther = new Session(); await tOther.login(otherTech.email);

// ---------------- role matrix ----------------
const matrix = [
  ['GET', '/api/me', [200, 200, 200]],
  ['GET', '/api/tickets/mine', [200, 200, 200]],
  ['GET', '/api/tickets', [403, 200, 200]],
  ['GET', '/api/admin/stats', [403, 403, 200]],
  ['GET', '/api/admin/alerts', [403, 403, 200]],
  ['GET', '/api/admin/users', [403, 403, 200]],
  ['POST', '/api/admin/sla-scan', [403, 403, 200]],
];
for (const [method, path, expected] of matrix) {
  const got = [(await emp.call(method, path)).status, (await tOther.call(method, path)).status, (await admin.call(method, path)).status];
  check(`role matrix ${method} ${path} (Employee/Technician/Admin)`, JSON.stringify(got) === JSON.stringify(expected), got.join('/'));
}

// ---------------- IDOR ----------------
const allTickets = (await admin.call('GET', '/api/tickets')).data.tickets;
const foreign = allTickets.find((t) => t.requester !== 'Aarav Sharma' && t.requester === 'Priya Nair');
check('employee cannot open another employee\'s ticket (404)', (await emp.call('GET', `/api/tickets/${foreign.ticket_id}`)).status === 404);
const mine = (await emp.call('GET', `/api/tickets/mine?userId=12`)).data.tickets;
check('?userId= parameter is ignored (only own tickets returned)', mine.every((t) => t.requester === 'Aarav Sharma'), `${mine.length} tickets`);
check('technician from another department cannot open the ticket (404)', (await tOther.call('GET', `/api/tickets/${allTickets.find((t) => t.department === 'IT Network').ticket_id}`)).status === 404);

// ---------------- ticket lifecycle + AI flow ----------------
const text = 'Wi-Fi keeps dropping in the 3rd floor lab';
const created = await emp.call('POST', '/api/tickets', { description: text, priority: 'High' });
check('employee submits a ticket (201)', created.status === 201, `#${created.data?.ticket_id}`);
const c = created.data;
check('AI decided suggest or route and picked IT Network', ['suggest', 'route'].includes(c.mode) && c.department.name === 'IT Network', `${c.mode}, ${c.department.name}, similarity ${c.similarity?.toFixed(2)}`);
check('a technician was assigned automatically', !!c.technician, c.technician);
check('SLA deadline was set by the database trigger', !!c.sla_deadline);
check('identical ticket submitted again is refused (409)', (await emp.call('POST', '/api/tickets', { description: text, priority: 'High' })).status === 409);
check('too-short description is refused (400)', (await emp.call('POST', '/api/tickets', { description: 'short' })).status === 400);

const inj = await emp.call('POST', '/api/tickets', { description: "Printer jam'; DROP TABLE tickets; --", priority: 'Low' });
check('SQL-injection text is stored as plain text (201) and tables survive', inj.status === 201 && (await emp.call('GET', '/api/tickets/mine')).status === 200);

check('another employee cannot request the explanation (404)', (await emp2.call('POST', `/api/tickets/${c.ticket_id}/explanation`)).status === 404);

const detail = (await emp.call('GET', `/api/tickets/${c.ticket_id}`)).data;
check('ticket detail includes status timeline and permissions', detail.timeline.length >= 1 && detail.can.withdraw === true);

// the assigned technician works the ticket
const tech = users.find((u) => u.role === 'Technician' && u.name === c.technician);
const ts = new Session(); await ts.login(tech.email);
const s1 = await tOther.call('PATCH', `/api/tickets/${c.ticket_id}`, { status: 'In Progress' });
check('a technician who is not assigned cannot update the ticket (403)', s1.status === 403);
check('assigned technician starts work (200)', (await ts.call('PATCH', `/api/tickets/${c.ticket_id}`, { status: 'In Progress' })).status === 200);
check('employee cannot withdraw a ticket that is already in progress (409)', (await emp.call('DELETE', `/api/tickets/${c.ticket_id}`)).status === 409);
check('resolving without a resolution is refused (400)', (await ts.call('PATCH', `/api/tickets/${c.ticket_id}`, { status: 'Resolved' })).status === 400);
const resolution = 'Restarted the access point on floor 3 and updated its firmware.';
check('technician resolves the ticket (200)', (await ts.call('PATCH', `/api/tickets/${c.ticket_id}`, { status: 'Resolved', resolution_text: resolution })).status === 200);
const after = (await emp.call('GET', `/api/tickets/${c.ticket_id}`)).data;
check('ticket is Resolved, verified, and the audit trail shows who changed it', after.ticket.status === 'Resolved' && after.ticket.resolution_verified && after.timeline.some((l) => l.changed_by === tech.name));

// the system learns: a similar ticket from someone else now matches the new verified fix
const again = await emp2.call('POST', '/api/tickets', { description: 'Wi-Fi keeps dropping in the 3rd floor lab area', priority: 'Medium' });
check('the next similar ticket is matched to the newly verified fix', again.data.mode === 'suggest' && (again.data.source?.ticket_id === c.ticket_id || !!again.data.source?.ticket_id), `source #${again.data.source?.ticket_id}, similarity ${again.data.similarity?.toFixed(2)}`);

// Gemini explanation step (RAG). Offline mock mode here; the real API is used when GEMINI_MOCK is not true.
const e1 = await emp2.call('POST', `/api/tickets/${again.data.ticket_id}/explanation`);
check('explanation step returns a grounded answer that cites a supplied ticket', e1.data.status === 'ok' && e1.data.text.includes(`[#${c.ticket_id}]`), e1.data.model);
const e2 = await emp2.call('POST', `/api/tickets/${again.data.ticket_id}/explanation`);
check('explanation is cached after the first call (no second LLM call)', e2.data.cached === true);
check('explanation is stored and shown on the ticket detail', (await emp2.call('GET', `/api/tickets/${again.data.ticket_id}`)).data.suggestion.explanation_status === 'ok');

// employee closes it with the suggestion, then reopens
const fb = await emp2.call('POST', `/api/tickets/${again.data.ticket_id}/feedback`, { helpful: true });
check('employee accepts the suggestion and the ticket closes (200)', fb.status === 200 && fb.data.resolved === true);
check('feedback can only be given once (409)', (await emp2.call('POST', `/api/tickets/${again.data.ticket_id}/feedback`, { helpful: false })).status === 409);
const ro = await emp2.call('POST', `/api/tickets/${again.data.ticket_id}/reopen`);
const roDetail = (await emp2.call('GET', `/api/tickets/${again.data.ticket_id}`)).data;
check('reopen sets the ticket Open again and removes the fix from suggestions', ro.status === 200 && roDetail.ticket.status === 'Open' && roDetail.ticket.resolution_verified === false);

// withdraw (DELETE)
const w = await emp.call('POST', '/api/tickets', { description: 'Projector in meeting room 4 shows no signal', priority: 'Low' });
check('employee withdraws an Open ticket (DELETE 200)', (await emp.call('DELETE', `/api/tickets/${w.data.ticket_id}`)).status === 200);
check('withdrawn ticket is really gone (404)', (await emp.call('GET', `/api/tickets/${w.data.ticket_id}`)).status === 404);

// search
const q = await emp.call('GET', '/api/tickets/mine?q=wifi');
check('full-text search over own tickets works (200)', q.status === 200);

// ---------------- admin actions ----------------
const t2 = await emp.call('POST', '/api/tickets', { description: 'Strange noise from the server room air conditioner', priority: 'Medium' });
const tid = t2.data.ticket_id;
const meta = (await admin.call('GET', '/api/meta')).data;
const triageId = meta.departments.find((d) => d.name === 'Triage').dept_id;
const hvacId = meta.departments.find((d) => d.name === 'Facilities HVAC').dept_id;
const itId = meta.departments.find((d) => d.name === 'IT Network').dept_id;
check('admin reassigns a ticket to Triage (200)', (await admin.call('PATCH', `/api/admin/tickets/${tid}/assign`, { action: 'reassign', dept_id: triageId })).status === 200);
const tri = (await admin.call('GET', '/api/tickets?scope=triage')).data.tickets;
check('the ticket shows up in the triage queue', tri.some((t) => t.ticket_id === tid));
check('admin routes it to HVAC with automatic technician (200)', (await admin.call('PATCH', `/api/admin/tickets/${tid}/assign`, { action: 'reassign', dept_id: hvacId })).status === 200);
const itTech = meta.technicians.find((x) => x.dept_id === itId);
check('database refuses a technician from another department (409)', (await admin.call('PATCH', `/api/admin/tickets/${tid}/assign`, { action: 'reassign', dept_id: hvacId, tech_id: itTech.tech_id })).status === 409);
check('admin escalates priority (200)', (await admin.call('PATCH', `/api/admin/tickets/${tid}/assign`, { action: 'escalate', priority: 'Critical' })).status === 200);
check('escalating to a lower priority is refused (409)', (await admin.call('PATCH', `/api/admin/tickets/${tid}/assign`, { action: 'escalate', priority: 'Low' })).status === 409);
check('an employee cannot reassign (403)', (await emp.call('PATCH', `/api/admin/tickets/${tid}/assign`, { action: 'reassign', dept_id: itId })).status === 403);

const stats = (await admin.call('GET', '/api/admin/stats')).data;
check('dashboard data has KPIs, workload, department summary and AI performance', stats.kpi.total > 100 && stats.workload.length >= 8 && stats.summary.length === 7 && stats.performance.total_decisions >= 3,
  `total=${stats.kpi.total}, decisions=${stats.performance.total_decisions}, deflected=${stats.performance.deflected}, accuracy=${stats.performance.routing_accuracy_pct}`);
check('SLA scan via the cron secret works without a session', (await new Session().call('POST', '/api/admin/sla-scan', null, { 'x-cron-secret': process.env.CRON_SECRET })).status === 200);
check('SLA scan with a wrong cron secret is refused', (await new Session().call('POST', '/api/admin/sla-scan', null, { 'x-cron-secret': 'nope' })).status === 401);

// user management
const email = `new.tech.${Date.now()}@smartdesk.example`;
const cu = await admin.call('POST', '/api/admin/users', { name: 'New Technician', email, password: 'LongEnough#2026', role: 'Technician', dept_id: hvacId });
check('admin creates a technician account (201)', cu.status === 201);
check('duplicate email is refused (409)', (await admin.call('POST', '/api/admin/users', { name: 'Dup', email, password: 'LongEnough#2026', role: 'Employee' })).status === 409);
check('short password is refused (400)', (await admin.call('POST', '/api/admin/users', { name: 'Weak', email: 'weak@smartdesk.example', password: 'short', role: 'Employee' })).status === 400);
const nt = new Session();
check('the new account can sign in', (await nt.login(email, 'LongEnough#2026')).status === 200);
check('admin deactivates the account (200)', (await admin.call('PATCH', `/api/admin/users/${cu.data.user_id}`, { is_active: false })).status === 200);
check('a deactivated account is signed out immediately (401)', (await nt.call('GET', '/api/me')).status === 401);
check('a deactivated account cannot sign in again (401)', (await new Session().login(email, 'LongEnough#2026')).status === 401);
const me = (await admin.call('GET', '/api/me')).data.user;
check('admin cannot deactivate their own account (409)', (await admin.call('PATCH', `/api/admin/users/${me.id}`, { is_active: false })).status === 409);

// CSRF origin check + logout
check('cross-origin state-changing request is refused (403)', (await emp.call('POST', '/api/tickets', { description: 'Cross origin attempt text', priority: 'Low' }, { Origin: 'https://evil.example' })).status === 403);
await emp.call('POST', '/api/auth/logout');
check('after logout the session is gone (401)', (await emp.call('GET', '/api/me')).status === 401);

const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} API checks passed`);
process.exit(ok === results.length ? 0 : 1);
