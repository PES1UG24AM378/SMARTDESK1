'use client';
import { useState } from 'react';
import Link from 'next/link';
import { StatusBadge, PriorityBadge, Sla, UnassignedBadge, fmt } from './ui.js';

export default function TicketTable({
  tickets,
  showRequester = false,
  empty = 'No tickets found.',
  meta = null,
  showAssign = false,
  onAssign = null,
}) {
  const [assigningId, setAssigningId] = useState(null);
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedTech, setSelectedTech] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!tickets) return <p className="muted">Loading...</p>;
  if (tickets.length === 0) return <p className="muted">{empty}</p>;

  function startAssign(t) {
    const defaultDept = t.dept_id && t.department !== 'Triage' ? String(t.dept_id) : '';
    setAssigningId(t.ticket_id);
    setSelectedDept(defaultDept);
    setSelectedTech('');
  }

  function cancelAssign() {
    setAssigningId(null);
    setSelectedDept('');
    setSelectedTech('');
  }

  async function handleAssign(ticketId) {
    if (!onAssign) return;
    setIsSubmitting(true);
    try {
      await onAssign(ticketId, {
        dept_id: selectedDept ? Number(selectedDept) : undefined,
        tech_id: selectedTech ? Number(selectedTech) : undefined,
      });
      cancelAssign();
    } finally {
      setIsSubmitting(false);
    }
  }

  const eligibleTechs = (meta?.technicians || []).filter(
    (tech) => !selectedDept || tech.dept_id === Number(selectedDept)
  );

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Problem</th>
            {showRequester && <th>Requester</th>}
            <th>Department</th>
            <th>Technician</th>
            <th>Priority</th>
            <th>Status</th>
            <th>SLA</th>
            <th>Created</th>
            {showAssign && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => {
            const isEditing = assigningId === t.ticket_id;
            const canAssign = t.status !== 'Resolved';
            return (
              <tr key={t.ticket_id}>
                <td><Link href={`/tickets/${t.ticket_id}`}>#{t.ticket_id}</Link></td>
                <td className="desc"><Link href={`/tickets/${t.ticket_id}`} style={{ color: 'inherit' }}>{t.description}</Link></td>
                {showRequester && <td>{t.requester}</td>}
                <td>{t.department}</td>
                <td>
                  {t.technician ? (
                    <span>{t.technician}</span>
                  ) : (
                    <UnassignedBadge ticket={t} />
                  )}
                </td>
                <td><PriorityBadge priority={t.priority} /></td>
                <td><StatusBadge status={t.status} /></td>
                <td><Sla ticket={t} /></td>
                <td className="muted">{fmt(t.created_at)}</td>
                {showAssign && (
                  <td>
                    {canAssign && (
                      isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200, padding: '4px 0' }}>
                          <select
                            style={{ fontSize: 13, padding: '4px 8px' }}
                            value={selectedDept}
                            onChange={(e) => { setSelectedDept(e.target.value); setSelectedTech(''); }}
                          >
                            <option value="">Choose department...</option>
                            {(meta?.departments || [])
                              .filter((d) => d.name !== 'Triage')
                              .map((d) => (
                                <option key={d.dept_id} value={d.dept_id}>{d.name}</option>
                              ))}
                          </select>
                          <select
                            style={{ fontSize: 13, padding: '4px 8px' }}
                            value={selectedTech}
                            onChange={(e) => setSelectedTech(e.target.value)}
                            disabled={!selectedDept}
                          >
                            <option value="">Auto (least loaded)</option>
                            {eligibleTechs.map((tech) => (
                              <option key={tech.tech_id} value={tech.tech_id}>{tech.name}</option>
                            ))}
                          </select>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="btn small"
                              disabled={!selectedDept || isSubmitting}
                              onClick={() => handleAssign(t.ticket_id)}
                            >
                              {isSubmitting ? 'Saving...' : 'Assign'}
                            </button>
                            <button
                              className="btn outline small"
                              disabled={isSubmitting}
                              onClick={cancelAssign}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="btn outline small"
                          onClick={() => startAssign(t)}
                        >
                          {t.technician ? 'Reassign' : 'Assign'}
                        </button>
                      )
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
