// Small presentational helpers shared by the pages.
export const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

const STATUS_CLASS = { 'Open': 'b-open', 'In Progress': 'b-progress', 'Resolved': 'b-resolved' };
const PRIORITY_CLASS = { Critical: 'b-critical', High: 'b-high', Medium: 'b-medium', Low: 'b-low' };

export const StatusBadge = ({ status }) => <span className={`badge ${STATUS_CLASS[status] || ''}`}>{status}</span>;
export const PriorityBadge = ({ priority }) => <span className={`badge ${PRIORITY_CLASS[priority] || ''}`}>{priority}</span>;

const REASON_LABELS = {
  'NO_ACTIVE_TECHNICIAN': 'No active technician',
  'TRIAGE_REQUIRED': 'Awaiting triage',
  'LOW_CONFIDENCE': 'Low similarity',
  'SPLIT_VOTE': 'Split vote',
  'AI_UNAVAILABLE': 'AI unavailable',
  'MANUAL_UNASSIGN': 'Unassigned',
};

export function UnassignedBadge({ ticket }) {
  if (ticket.technician) return <span>{ticket.technician}</span>;
  const code = ticket.unassigned_reason || (ticket.department === 'Triage' ? 'TRIAGE_REQUIRED' : 'NO_ACTIVE_TECHNICIAN');
  const label = REASON_LABELS[code] || code;
  const isTriage = code.includes('TRIAGE') || code.includes('CONFIDENCE') || code.includes('VOTE') || code.includes('AI');
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
      <span className="badge b-unassigned">Unassigned</span>
      <span className={`badge ${isTriage ? 'b-triage' : 'b-critical'}`} style={{ fontSize: 11, padding: '1px 6px' }}>{label}</span>
    </div>
  );
}

export function Sla({ ticket }) {
  if (ticket.status === 'Resolved') {
    return <span className="badge b-resolved">Resolved {ticket.resolved_at ? fmt(ticket.resolved_at) : ''}</span>;
  }
  const hours = (new Date(ticket.sla_deadline) - Date.now()) / 3600000;
  if (ticket.overdue || hours < 0) {
    return <span className="badge b-overdue" title={`Deadline was ${fmt(ticket.sla_deadline)}`}>Overdue {Math.max(1, Math.round(-hours))}h</span>;
  }
  if (hours <= 4) {
    return <span className="badge b-duesoon" title={`Deadline is ${fmt(ticket.sla_deadline)}`}>Due Soon ({Math.max(1, Math.round(hours))}h left)</span>;
  }
  return <span className="badge b-ontrack" title={`Deadline is ${fmt(ticket.sla_deadline)}`}>On Track ({Math.round(hours)}h left)</span>;
}

export const Msg = ({ kind = 'info', children }) => children ? <div className={`msg ${kind}`}>{children}</div> : null;

export function Stat({ label, value, alert }) {
  return <div className={`stat ${alert ? 'alert' : ''}`}><div className="num">{value ?? '-'}</div><div className="label">{label}</div></div>;
}

export function Bars({ items, max, red }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return items.map((i) => (
    <div className="bar-row" key={i.label}>
      <span>{i.label}</span>
      <div className={`bar ${red ? 'red' : ''}`}><span style={{ width: `${Math.round((i.value / top) * 100)}%` }} /></div>
      <b>{i.value}</b>
    </div>
  ));
}
