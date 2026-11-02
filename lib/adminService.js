// Admin dashboard data, SLA scan, reassign / escalate, and user management.
import bcrypt from 'bcryptjs';
import { query, withTransaction } from './db.js';
import { HttpError } from './errors.js';

export async function getStats() {
  const [status, priority, kpi, workload, summary, recurring, perf, alerts] = await Promise.all([
    query(`SELECT status, COUNT(*)::int AS count FROM tickets GROUP BY status`),
    query(`SELECT priority, COUNT(*)::int AS count FROM tickets WHERE status <> 'Resolved' GROUP BY priority`),
    query(`SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE status <> 'Resolved')::int AS active,
                  COUNT(*) FILTER (WHERE status <> 'Resolved' AND sla_deadline < now())::int AS overdue,
                  COUNT(*) FILTER (WHERE status <> 'Resolved' AND tech_id IS NULL)::int AS unassigned,
                  ROUND((AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)
                         FILTER (WHERE status = 'Resolved'))::numeric, 1) AS avg_resolution_hours
             FROM tickets`),
    query(`SELECT * FROM technician_workload ORDER BY department, technician`),
    query(`SELECT * FROM resolution_summary ORDER BY dept_id`),
    query(`SELECT * FROM recurring_issues ORDER BY times_suggested DESC LIMIT 10`),
    query(`SELECT * FROM suggestion_performance`),
    query(`SELECT COUNT(*)::int AS active_alerts FROM sla_alerts a JOIN tickets t ON t.ticket_id = a.ticket_id
            WHERE t.status <> 'Resolved'`),
  ]);
  return {
    status: status.rows, priority: priority.rows, kpi: kpi.rows[0], workload: workload.rows,
    summary: summary.rows, recurring: recurring.rows, performance: perf.rows[0], activeAlerts: alerts.rows[0].active_alerts,
  };
}

export async function getAlerts(onlyActive = false) {
  const { rows } = await query(
    `SELECT a.alert_id, a.ticket_id, a.alert_type, a.created_at, t.priority, t.status, t.sla_deadline,
            d.name AS department, u.name AS technician, left(t.description, 80) AS description
       FROM sla_alerts a
       JOIN tickets t ON t.ticket_id = a.ticket_id
       JOIN departments d ON d.dept_id = t.dept_id
       LEFT JOIN technicians te ON te.tech_id = t.tech_id
       LEFT JOIN users u ON u.user_id = te.user_id
      ${onlyActive ? `WHERE t.status <> 'Resolved'` : ''}
      ORDER BY a.created_at DESC LIMIT 100`);
  return rows;
}

export async function runSlaScan() {
  const checkedRes = await query(
    `SELECT COUNT(*)::int AS checked FROM tickets WHERE status <> 'Resolved' AND sla_deadline < now()`
  );
  const { rows } = await query('CALL scan_and_alert_sla_breaches(NULL)');
  const newAlerts = rows[0].p_new_alerts;
  const ticketsChecked = checkedRes.rows[0].checked;
  console.log(`[smartdesk] SLA scan completed: ${ticketsChecked} overdue open tickets checked, ${newAlerts} new alerts created.`);
  return { newAlerts, ticketsChecked };
}

export async function adminTicketAction(admin, id, body) {
  if (body.action === 'escalate') {
    if (!body.priority) throw new HttpError(400, 'priority is required');
    await withTransaction(admin.user_id, (c) => c.query('CALL escalate_ticket($1, $2)', [id, body.priority]));
    return { ok: true };
  }
  return withTransaction(admin.user_id, async (c) => {
    const t = (await c.query('SELECT status, dept_id FROM tickets WHERE ticket_id = $1 FOR UPDATE', [id])).rows[0];
    if (!t) throw new HttpError(404, 'Ticket not found');
    if (t.status === 'Resolved') throw new HttpError(409, 'A resolved ticket cannot be reassigned');

    const targetDeptId = body.dept_id || t.dept_id;
    if (!targetDeptId) throw new HttpError(400, 'dept_id is required');

    const dept = (await c.query('SELECT name FROM departments WHERE dept_id = $1', [targetDeptId])).rows[0];
    if (!dept) throw new HttpError(400, 'Unknown department');

    await c.query('UPDATE tickets SET dept_id = $2, tech_id = NULL WHERE ticket_id = $1', [id, targetDeptId]);
    let techId = null;
    let unassignedReason = null;

    if (body.tech_id) {
      const techUser = (await c.query(
        `SELECT t.tech_id, u.is_active FROM technicians t
         JOIN users u ON u.user_id = t.user_id
         WHERE t.tech_id = $1 AND t.dept_id = $2`, [body.tech_id, targetDeptId])).rows[0];
      if (!techUser) {
        throw new HttpError(409, 'Technician does not belong to this department');
      }
      if (!techUser.is_active) {
        throw new HttpError(409, 'Technician is not active');
      }
      await c.query('UPDATE tickets SET tech_id = $2, unassigned_reason = NULL WHERE ticket_id = $1', [id, body.tech_id]);
      techId = body.tech_id;
    } else if (dept.name !== 'Triage') {
      try {
        techId = (await c.query('CALL assign_technician($1, NULL)', [id])).rows[0].p_tech_id;
        await c.query('UPDATE tickets SET unassigned_reason = NULL WHERE ticket_id = $1', [id]);
      } catch (err) {
        unassignedReason = 'NO_ACTIVE_TECHNICIAN';
        await c.query('UPDATE tickets SET unassigned_reason = $1, tech_id = NULL WHERE ticket_id = $2', [unassignedReason, id]);
      }
    } else {
      unassignedReason = 'TRIAGE_REQUIRED';
      await c.query('UPDATE tickets SET unassigned_reason = $1, tech_id = NULL WHERE ticket_id = $2', [unassignedReason, id]);
    }
    return { ok: true, tech_id: techId, unassigned_reason: unassignedReason };
  });
}

export async function listUsers() {
  const { rows } = await query(
    `SELECT u.user_id, u.name, u.email, u.role, u.is_active, u.created_at, d.name AS department,
            (SELECT COUNT(*)::int FROM tickets k WHERE k.tech_id = t.tech_id AND k.status <> 'Resolved') AS active_tickets
       FROM users u
       LEFT JOIN technicians t ON t.user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = t.dept_id
      ORDER BY CASE u.role WHEN 'Admin' THEN 1 WHEN 'Technician' THEN 2 ELSE 3 END, u.name`);
  return rows;
}

export async function createUser(admin, { name, email, password, role, dept_id }) {
  if (role === 'Technician' && !dept_id) throw new HttpError(400, 'A technician needs a department');
  const hash = await bcrypt.hash(password, 10);
  return withTransaction(admin.user_id, async (c) => {
    const u = (await c.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING user_id', [name, email, hash, role])).rows[0];
    if (role === 'Technician') await c.query('INSERT INTO technicians (user_id, dept_id) VALUES ($1, $2)', [u.user_id, dept_id]);
    return { user_id: u.user_id };
  });
}

export async function setUserActive(admin, userId, active) {
  if (userId === admin.user_id && !active) throw new HttpError(409, 'You cannot deactivate your own account');
  const { rowCount } = await query('UPDATE users SET is_active = $2 WHERE user_id = $1', [userId, active]);
  if (!rowCount) throw new HttpError(404, 'User not found');
  return { ok: true };
}
