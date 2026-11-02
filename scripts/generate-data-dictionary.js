// Writes docs/data_dictionary.md from the live database catalog plus the descriptions below.
// Run: node --env-file=.env.local scripts/generate-data-dictionary.js
import fs from 'node:fs';
import pg from 'pg';

const D = {
  'departments.dept_id': 'Department identifier', 'departments.name': 'Team name, e.g. IT Network; "Triage" holds unrouted tickets',
  'sla_policies.priority': 'Priority level (Critical, High, Medium, Low)', 'sla_policies.resolution_hours': 'Hours allowed to resolve a ticket of this priority',
  'users.user_id': 'User identifier', 'users.name': 'Full name', 'users.email': 'Login email (unique, format checked)',
  'users.password_hash': 'bcrypt hash; the password is never stored', 'users.role': 'Employee, Technician or Admin',
  'users.is_active': 'false = deactivated; cannot sign in and is skipped by assignment', 'users.created_at': 'Account creation time',
  'technicians.tech_id': 'Technician identifier', 'technicians.user_id': 'The user account of this technician', 'technicians.dept_id': 'Department the technician works in',
  'tickets.ticket_id': 'Ticket identifier', 'tickets.user_id': 'Employee who reported the problem', 'tickets.dept_id': 'Department handling the ticket (Triage if not routed yet)',
  'tickets.tech_id': 'Assigned technician; (tech_id, dept_id) must match a technician of that department', 'tickets.description': 'Problem in free text, 10 to 2000 characters',
  'tickets.priority': 'Priority; decides the SLA deadline', 'tickets.status': 'Open, In Progress or Resolved', 'tickets.resolution_text': 'What fixed the problem',
  'tickets.resolution_verified': 'true only when a technician wrote the resolution; only verified fixes are suggested to others',
  'tickets.created_at': 'When the ticket was created', 'tickets.resolved_at': 'When it was resolved (NULL unless Resolved)', 'tickets.sla_deadline': 'created_at + hours of the priority, set by a trigger',
  'tickets.embedding': '384-number sentence embedding of the description (pgvector)', 'tickets.search_tsv': 'Generated full-text search vector over description and resolution',
  'ticket_status_log.log_id': 'Log row identifier', 'ticket_status_log.ticket_id': 'Ticket the change belongs to', 'ticket_status_log.old_status': 'Status before (NULL at creation)',
  'ticket_status_log.new_status': 'Status after', 'ticket_status_log.changed_by': 'User who made the change (from app.user_id)', 'ticket_status_log.changed_at': 'When',
  'sla_alerts.alert_id': 'Alert identifier', 'sla_alerts.ticket_id': 'Ticket that breached its SLA', 'sla_alerts.alert_type': 'Active Exceeded (still open) or Resolved Late', 'sla_alerts.created_at': 'When the alert was raised',
  'ticket_deletions.deletion_id': 'Row identifier', 'ticket_deletions.ticket_id': 'Id of the deleted ticket', 'ticket_deletions.user_id': 'Who reported it',
  'ticket_deletions.description': 'Text of the withdrawn ticket', 'ticket_deletions.status': 'Status when it was withdrawn', 'ticket_deletions.deleted_by': 'User who withdrew it', 'ticket_deletions.deleted_at': 'When',
  'ticket_suggestions.suggestion_id': 'Row identifier', 'ticket_suggestions.ticket_id': 'The ticket this decision belongs to (one per ticket)',
  'ticket_suggestions.source_ticket_id': 'Past resolved ticket whose fix was suggested', 'ticket_suggestions.mode': 'suggest, route or triage',
  'ticket_suggestions.similarity': 'Cosine similarity of the best match (0 to 1)', 'ticket_suggestions.predicted_dept_id': 'Department the system chose (compare with tickets.dept_id for accuracy)',
  'ticket_suggestions.retrieved_ids': 'Ids of the top retrieved tickets used for the explanation', 'ticket_suggestions.helpful': 'Employee feedback: true = solved it, false = needed help',
  'ticket_suggestions.explanation': 'Gemini-written explanation (cached)', 'ticket_suggestions.explanation_model': 'Model that wrote it', 'ticket_suggestions.explanation_status': 'none, ok, fallback or error',
  'ticket_suggestions.explained_at': 'When the explanation was generated', 'ticket_suggestions.created_at': 'When the decision was made',
};

const c = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL });
await c.connect();
const tables = (await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`)).rows;
const pk = new Set((await c.query(`SELECT tc.table_name || '.' || kcu.column_name AS k FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public'`)).rows.map((r) => r.k));
const fk = Object.fromEntries((await c.query(`SELECT cl.relname AS t, a.attname AS col, cf.relname AS ref FROM pg_constraint co JOIN pg_class cl ON cl.oid=co.conrelid JOIN pg_class cf ON cf.oid=co.confrelid
  JOIN pg_attribute a ON a.attrelid=co.conrelid AND a.attnum = ANY(co.conkey) WHERE co.contype='f' AND cl.relnamespace='public'::regnamespace`)).rows.map((r) => [`${r.t}.${r.col}`, r.ref]));

let out = '# Data dictionary\n\nGenerated from the live database by `scripts/generate-data-dictionary.js`.\n\n';
for (const { table_name: t } of tables) {
  out += `## ${t}\n\n| Column | Type | Null | Key | Default | Meaning |\n|---|---|---|---|---|---|\n`;
  const cols = (await c.query(`SELECT column_name, udt_name, data_type, character_maximum_length, is_nullable, column_default, is_generated
      FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t])).rows;
  for (const col of cols) {
    const key = `${t}.${col.column_name}`;
    const type = col.udt_name === 'vector' ? 'vector(384)' : col.character_maximum_length ? `${col.data_type}(${col.character_maximum_length})` : col.data_type;
    const k = [pk.has(key) ? 'PK' : '', fk[key] ? `FK -> ${fk[key]}` : ''].filter(Boolean).join(', ');
    const def = col.is_generated === 'ALWAYS' ? 'generated' : (col.column_default || '').replace(/::[a-z ]+/g, '').replace(/\|/g, '\\|').slice(0, 40);
    out += `| ${col.column_name} | ${type} | ${col.is_nullable === 'YES' ? 'yes' : 'no'} | ${k} | ${def} | ${D[key] || ''} |\n`;
  }
  const checks = (await c.query(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = $1::regclass AND contype IN ('c','u') ORDER BY conname`, [t])).rows;
  if (checks.length) { out += '\nConstraints:\n\n'; for (const k of checks) out += `- \`${k.conname}\`: \`${k.def.replace(/\s+/g, ' ')}\`\n`; }
  out += '\n';
}
fs.writeFileSync('docs/data_dictionary.md', out);
console.log('docs/data_dictionary.md written,', tables.length, 'tables');
await c.end();
