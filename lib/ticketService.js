// All ticket business logic. Routes stay thin; every rule that must not be skipped
// (deadline, audit, assignment lock, validation) lives in the database.
import { query, withTransaction } from './db.js';
import { HttpError } from './errors.js';
import { getEmbedding, withTimeout } from './embeddings.js';
import { formatVector, findSimilar, countSimilarOpen } from './similarity.js';
import { decide, thresholds, routingReason } from './decide.js';
import { explain } from './explain.js';

async function getTriageDeptId() {
  globalThis._sdTriage ??= (async () => {
    const { rows } = await query("SELECT dept_id FROM departments WHERE name = 'Triage'");
    if (!rows[0]) throw new Error('Triage department is missing; run npm run db:reset');
    return rows[0].dept_id;
  })();
  return globalThis._sdTriage;
}

/* ------------------------------------------------------------------ */
/* Create a ticket: embed -> search -> decide -> save -> assign        */
/* ------------------------------------------------------------------ */
export async function createTicket(user, { description, priority }) {
  const recent = await query(
    `SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE description = $2 AND created_at > now() - INTERVAL '60 seconds')::int AS dup
       FROM tickets WHERE user_id = $1 AND created_at > now() - INTERVAL '1 hour'`, [user.user_id, description]);
  if (recent.rows[0].dup > 0) throw new HttpError(409, 'You just submitted this same ticket');
  if (recent.rows[0].n >= 20) throw new HttpError(429, 'Too many tickets in the last hour. Please wait a little.');

  // AI step. Any failure here must NOT block ticket creation: the ticket just goes to triage.
  let decision = { mode: 'triage', reason: 'ai_unavailable' };
  let vec = null;
  let similarOpen = { reports: 0, people: 0 };
  try {
    const emb = await withTimeout(getEmbedding(description), Number(process.env.EMBED_TIMEOUT_MS || 8000), 'embedding');
    vec = formatVector(emb);
    decision = decide(await findSimilar({ query }, vec));
    similarOpen = await countSimilarOpen({ query }, vec, thresholds().CLUSTER);
  } catch (err) {
    console.error('[smartdesk] AI step failed, ticket will go to triage:', err.message);
    decision = { mode: 'triage', reason: 'ai_unavailable' };
  }

  const triageId = await getTriageDeptId();
  const saved = await withTransaction(user.user_id, async (c) => {
    let unassignedReason = null;
    if (decision.mode === 'triage') {
      unassignedReason = decision.reason === 'split_vote' ? 'SPLIT_VOTE' : (decision.reason === 'ai_unavailable' ? 'AI_UNAVAILABLE' : 'LOW_CONFIDENCE');
    }

    const ins = await c.query(
      `INSERT INTO tickets (user_id, dept_id, description, priority, embedding, unassigned_reason)
       VALUES ($1, $2, $3, $4, $5::vector, $6) RETURNING ticket_id, sla_deadline`,
      [user.user_id, decision.deptId ?? triageId, description, priority, vec, unassignedReason]);
    const id = ins.rows[0].ticket_id;

    await c.query(
      `INSERT INTO ticket_suggestions (ticket_id, source_ticket_id, mode, similarity, predicted_dept_id, retrieved_ids)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, decision.sourceTicketId ?? null, decision.mode, decision.similarity ?? null, decision.deptId ?? null, decision.retrievedIds ?? null]);

    let techId = null;
    if (decision.mode !== 'triage') {
      await c.query('SAVEPOINT assign');            // a failed assignment must not lose the ticket
      try {
        const r = await c.query('CALL assign_technician($1, NULL)', [id]);
        techId = r.rows[0].p_tech_id;
        unassignedReason = null;
        await c.query('RELEASE SAVEPOINT assign');
      } catch (err) {
        await c.query('ROLLBACK TO SAVEPOINT assign');
        console.error('[smartdesk] assignment failed, ticket stays unassigned:', err.message);
        unassignedReason = 'NO_ACTIVE_TECHNICIAN';
        await c.query('UPDATE tickets SET unassigned_reason = $1, tech_id = NULL WHERE ticket_id = $2', [unassignedReason, id]);
      }
    }
    return { id, techId, sla_deadline: ins.rows[0].sla_deadline, unassigned_reason: unassignedReason };
  });

  const dept = (await query('SELECT dept_id, name FROM departments WHERE dept_id = $1', [decision.deptId ?? triageId])).rows[0];
  let technician = null;
  if (saved.techId) {
    technician = (await query(`SELECT u.name FROM technicians t JOIN users u ON u.user_id = t.user_id WHERE t.tech_id = $1`, [saved.techId])).rows[0]?.name ?? null;
  }
  let source = null;
  if (decision.sourceTicketId) {
    source = (await query('SELECT ticket_id, description, resolution_text FROM tickets WHERE ticket_id = $1', [decision.sourceTicketId])).rows[0] ?? null;
  }
  return {
    ticket_id: saved.id, mode: decision.mode, department: dept, technician,
    sla_deadline: saved.sla_deadline, similarity: decision.similarity ?? null,
    unassigned_reason: saved.unassigned_reason,
    reason: routingReason(decision, dept.name), source, similarOpen,
  };
}

/* ------------------------------------------------------------------ */
/* Lists                                                                */
/* ------------------------------------------------------------------ */
const LIST_SELECT = `
  SELECT t.ticket_id, t.dept_id, t.description, t.priority, t.status, t.created_at, t.sla_deadline, t.resolved_at,
         t.unassigned_reason,
         d.name AS department, tu.name AS technician, ru.name AS requester,
         (t.status <> 'Resolved' AND t.sla_deadline < now()) AS overdue
    FROM tickets t
    JOIN departments d ON d.dept_id = t.dept_id
    JOIN users ru ON ru.user_id = t.user_id
    LEFT JOIN technicians te ON te.tech_id = t.tech_id
    LEFT JOIN users tu ON tu.user_id = te.user_id`;

function addFilters(where, params, f) {
  if (f.status) { params.push(f.status); where.push(`t.status = $${params.length}`); }
  if (f.priority) { params.push(f.priority); where.push(`t.priority = $${params.length}`); }
  if (f.dept_id) { params.push(f.dept_id); where.push(`t.dept_id = $${params.length}`); }
  if (f.q) { params.push(f.q); where.push(`t.search_tsv @@ websearch_to_tsquery('english', $${params.length})`); }
}

export async function listMine(user, f) {
  const params = [user.user_id];
  const where = ['t.user_id = $1'];
  addFilters(where, params, f);
  const { rows } = await query(`${LIST_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC LIMIT 100`, params);
  return rows;
}

export async function listStaff(user, f) {
  const params = [];
  const where = [];
  let order = 't.created_at DESC';
  if (user.role === 'Technician') {
    if (f.scope === 'queue') {
      params.push(user.tech_id); where.push(`t.tech_id = $${params.length}`, `t.status <> 'Resolved'`);
      order = 't.sla_deadline ASC';
    } else {
      params.push(user.dept_id); where.push(`t.dept_id = $${params.length}`);
    }
  } else {   // Admin
    if (f.scope === 'triage') { where.push(`d.name = 'Triage'`, `t.status <> 'Resolved'`); order = 't.created_at ASC'; }
    if (f.scope === 'unassigned') { where.push('t.tech_id IS NULL', `t.status <> 'Resolved'`); order = 't.created_at ASC'; }
    if (f.scope === 'queue') { where.push(`t.status <> 'Resolved'`); order = 't.sla_deadline ASC'; }
  }
  addFilters(where, params, f);
  const sql = `${LIST_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT 200`;
  return (await query(sql, params)).rows;
}

/* ------------------------------------------------------------------ */
/* One ticket (with role-based visibility)                              */
/* ------------------------------------------------------------------ */
async function loadTicketRow(id) {
  return (await query(
    `SELECT t.*, d.name AS department, tu.name AS technician, ru.name AS requester,
            (t.status <> 'Resolved' AND t.sla_deadline < now()) AS overdue
       FROM tickets t
       JOIN departments d ON d.dept_id = t.dept_id
       JOIN users ru ON ru.user_id = t.user_id
       LEFT JOIN technicians te ON te.tech_id = t.tech_id
       LEFT JOIN users tu ON tu.user_id = te.user_id
      WHERE t.ticket_id = $1`, [id])).rows[0];
}

function roleFlags(user, t) {
  const isOwner = t.user_id === user.user_id;
  const isAdmin = user.role === 'Admin';
  const isAssigned = user.role === 'Technician' && t.tech_id === user.tech_id;
  const sameDept = user.role === 'Technician' && t.dept_id === user.dept_id;
  return { isOwner, isAdmin, isAssigned, sameDept, canSee: isOwner || isAdmin || isAssigned || sameDept };
}

export async function getTicket(user, id) {
  const t = await loadTicketRow(id);
  const f = t ? roleFlags(user, t) : null;
  if (!t || !f.canSee) throw new HttpError(404, 'Ticket not found');   // 404, not 403: do not reveal it exists

  const { rows: timeline } = await query(
    `SELECT l.old_status, l.new_status, l.changed_at, u.name AS changed_by
       FROM ticket_status_log l LEFT JOIN users u ON u.user_id = l.changed_by
      WHERE l.ticket_id = $1 ORDER BY l.changed_at, l.log_id`, [id]);

  const s = (await query(
    `SELECT s.mode, s.similarity, s.helpful, s.explanation, s.explanation_model, s.explanation_status,
            s.source_ticket_id, st.description AS source_description, st.resolution_text AS source_resolution,
            pd.name AS predicted_department
       FROM ticket_suggestions s
       LEFT JOIN tickets st ON st.ticket_id = s.source_ticket_id
       LEFT JOIN departments pd ON pd.dept_id = s.predicted_dept_id
      WHERE s.ticket_id = $1`, [id])).rows[0] ?? null;

  const open = t.status !== 'Resolved';
  const { embedding, search_tsv, ...ticket } = t;
  return {
    ticket,
    suggestion: s,
    timeline,
    can: {
      start: (f.isAssigned || f.isAdmin) && t.status === 'Open',
      resolve: (f.isAssigned || f.isAdmin) && open,
      reopen: (f.isOwner || f.isAdmin) && t.status === 'Resolved',
      withdraw: (f.isOwner || f.isAdmin) && t.status === 'Open',
      reassign: f.isAdmin && open,
      escalate: f.isAdmin && open,
      rate: f.isOwner && !!s && s.helpful === null && s.mode === 'suggest' && open,
      explain: (f.isOwner || f.isAdmin) && !!s && s.mode === 'suggest',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Technician / Admin: start work and resolve                           */
/* ------------------------------------------------------------------ */
export async function updateTicket(user, id, { status, resolution_text }) {
  return withTransaction(user.user_id, async (c) => {
    const t = (await c.query('SELECT status, tech_id, dept_id FROM tickets WHERE ticket_id = $1 FOR UPDATE', [id])).rows[0];
    if (!t) throw new HttpError(404, 'Ticket not found');
    const allowed = user.role === 'Admin' || (user.role === 'Technician' && t.tech_id === user.tech_id);
    if (!allowed) throw new HttpError(403, 'Only the assigned technician or an Admin can update this ticket');
    if (t.status === 'Resolved') throw new HttpError(409, 'This ticket is already resolved');

    if (status === 'In Progress') {
      if (t.status !== 'Open') throw new HttpError(409, 'Ticket is already in progress');
      await c.query(`UPDATE tickets SET status = 'In Progress' WHERE ticket_id = $1`, [id]);
    } else {
      if (!resolution_text) throw new HttpError(400, 'A resolution is required to resolve a ticket');
      await c.query(
        `UPDATE tickets SET status = 'Resolved', resolution_text = $2, resolved_at = now(), resolution_verified = true
          WHERE ticket_id = $1`, [id, resolution_text]);
    }
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ */
/* Employee: feedback, reopen, withdraw                                 */
/* ------------------------------------------------------------------ */
export async function submitFeedback(user, id, helpful) {
  return withTransaction(user.user_id, async (c) => {
    const r = (await c.query(
      `SELECT t.user_id, t.status, s.helpful, s.mode, st.resolution_text AS source_resolution
         FROM tickets t
         JOIN ticket_suggestions s ON s.ticket_id = t.ticket_id
         LEFT JOIN tickets st ON st.ticket_id = s.source_ticket_id
        WHERE t.ticket_id = $1 FOR UPDATE OF t, s`, [id])).rows[0];
    if (!r || r.user_id !== user.user_id) throw new HttpError(404, 'Ticket not found');
    if (r.helpful !== null) throw new HttpError(409, 'You already answered this');

    await c.query('UPDATE ticket_suggestions SET helpful = $2 WHERE ticket_id = $1', [id, helpful]);
    let resolved = false;
    if (helpful && r.mode === 'suggest' && r.status !== 'Resolved' && r.source_resolution) {
      // the employee fixed it themselves: close the ticket with the suggested fix (not technician-verified)
      await c.query(
        `UPDATE tickets SET status = 'Resolved', resolution_text = $2, resolved_at = now(), resolution_verified = false
          WHERE ticket_id = $1`, [id, r.source_resolution]);
      resolved = true;
    }
    return { ok: true, resolved };
  });
}

export async function reopenTicket(user, id) {
  return withTransaction(user.user_id, async (c) => {
    const t = (await c.query('SELECT user_id, status, dept_id FROM tickets WHERE ticket_id = $1 FOR UPDATE', [id])).rows[0];
    if (!t || (t.user_id !== user.user_id && user.role !== 'Admin')) throw new HttpError(404, 'Ticket not found');
    if (t.status !== 'Resolved') throw new HttpError(409, 'Only a resolved ticket can be reopened');

    // reopening removes the (possibly wrong) resolution from future suggestions
    await c.query(`UPDATE tickets SET status = 'Open', resolved_at = NULL, resolution_verified = false WHERE ticket_id = $1`, [id]);
    await c.query('UPDATE ticket_suggestions SET helpful = FALSE WHERE ticket_id = $1 AND helpful IS TRUE', [id]);

    const triage = await getTriageDeptId();
    let techId = null;
    if (t.dept_id !== triage) {
      await c.query('SAVEPOINT assign');
      try {
        techId = (await c.query('CALL assign_technician($1, NULL)', [id])).rows[0].p_tech_id;
        await c.query('UPDATE tickets SET unassigned_reason = NULL WHERE ticket_id = $1', [id]);
        await c.query('RELEASE SAVEPOINT assign');
      } catch (err) {
        await c.query('ROLLBACK TO SAVEPOINT assign');
        await c.query('UPDATE tickets SET unassigned_reason = $1 WHERE ticket_id = $2', ['NO_ACTIVE_TECHNICIAN', id]);
      }
    } else {
      await c.query('UPDATE tickets SET unassigned_reason = $1 WHERE ticket_id = $2', ['TRIAGE_REQUIRED', id]);
    }
    return { ok: true, assigned: !!techId };
  });
}

export async function withdrawTicket(user, id) {
  return withTransaction(user.user_id, async (c) => {
    const t = (await c.query('SELECT user_id, status FROM tickets WHERE ticket_id = $1 FOR UPDATE', [id])).rows[0];
    if (!t || (t.user_id !== user.user_id && user.role !== 'Admin')) throw new HttpError(404, 'Ticket not found');
    if (t.status !== 'Open') throw new HttpError(409, 'Only tickets that are still Open can be withdrawn');
    await c.query('DELETE FROM tickets WHERE ticket_id = $1', [id]);   // trigger writes ticket_deletions
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ */
/* Gemini explanation (RAG): cached, rate limited, never blocks anything */
/* ------------------------------------------------------------------ */
export async function generateExplanation(user, id) {
  const r = (await query(
    `SELECT t.user_id, t.description, s.mode, s.retrieved_ids, s.explanation, s.explanation_status, s.explanation_model
       FROM tickets t JOIN ticket_suggestions s ON s.ticket_id = t.ticket_id WHERE t.ticket_id = $1`, [id])).rows[0];
  if (!r || (r.user_id !== user.user_id && user.role !== 'Admin')) throw new HttpError(404, 'Ticket not found');
  if (r.mode !== 'suggest' || !r.retrieved_ids?.length) return { status: 'none' };
  if (r.explanation_status !== 'none') return { status: r.explanation_status, text: r.explanation, model: r.explanation_model, cached: true };

  const used = (await query(
    `SELECT COUNT(*)::int AS n FROM ticket_suggestions s JOIN tickets t ON t.ticket_id = s.ticket_id
      WHERE t.user_id = $1 AND s.explained_at > now() - INTERVAL '1 hour'`, [r.user_id])).rows[0].n;
  if (used >= Number(process.env.EXPLAIN_PER_HOUR || 10)) throw new HttpError(429, 'Explanation limit reached for this hour');

  const sources = (await query(
    `SELECT t.ticket_id, t.description, t.resolution_text,
            1 - (t.embedding <=> (SELECT embedding FROM tickets WHERE ticket_id = $1)) AS similarity
       FROM tickets t
      WHERE t.ticket_id = ANY($2::int[]) AND t.status = 'Resolved' AND t.resolution_text IS NOT NULL
      ORDER BY array_position($2::int[], t.ticket_id)`, [id, r.retrieved_ids])).rows;

  const result = await explain(r.description, sources);
  if (result.status !== 'none') {
    await query(
      `UPDATE ticket_suggestions SET explanation = $2, explanation_model = $3, explanation_status = $4, explained_at = now()
        WHERE ticket_id = $1`, [id, result.text ?? null, result.model ?? null, result.status]);
  }
  return result;
}

export async function listMeta() {
  const departments = (await query(`SELECT dept_id, name FROM departments ORDER BY (name = 'Triage'), name`)).rows;
  const priorities = (await query('SELECT priority, resolution_hours FROM sla_policies ORDER BY resolution_hours')).rows;
  return { departments, priorities };
}
