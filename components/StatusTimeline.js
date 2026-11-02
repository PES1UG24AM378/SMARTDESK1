import { fmt } from './ui.js';

export default function StatusTimeline({ items }) {
  if (!items?.length) return <p className="muted">No history yet.</p>;
  return (
    <ul className="timeline">
      {items.map((l, i) => (
        <li key={i}>
          <b>{l.old_status ? `${l.old_status} → ${l.new_status}` : `Created as ${l.new_status}`}</b>
          <div className="muted small">{fmt(l.changed_at)}{l.changed_by ? ` · by ${l.changed_by}` : ''}</div>
        </li>
      ))}
    </ul>
  );
}
