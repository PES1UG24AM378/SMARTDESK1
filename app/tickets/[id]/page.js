'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, errText } from '@/components/api.js';
import { Msg, StatusBadge, PriorityBadge, Sla, UnassignedBadge, fmt } from '@/components/ui.js';
import StatusTimeline from '@/components/StatusTimeline.js';

export default function TicketDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('');
  const [adm, setAdm] = useState({ dept_id: '', tech_id: '', priority: '' });

  const load = useCallback(async () => {
    try { setData(await api(`/api/tickets/${id}`)); setError(''); }
    catch (e) { setError(errText(e)); }
  }, [id]);
  useEffect(() => { load(); api('/api/me').then((d) => setMe(d.user)); api('/api/meta').then(setMeta).catch(() => {}); }, [load]);

  async function act(fn, okMsg) {
    setError(''); setNote('');
    try { await fn(); if (okMsg) setNote(okMsg); await load(); } catch (e) { setError(errText(e)); }
  }

  if (error && !data) return <Msg kind="error">{error}</Msg>;
  if (!data) return <p className="muted">Loading...</p>;
  const { ticket: t, suggestion: s, timeline, can } = data;
  const techs = (meta?.technicians || []).filter((x) => !adm.dept_id || x.dept_id === Number(adm.dept_id));

  return (
    <>
      <div className="page-head">
        <div><h1>Ticket #{t.ticket_id}</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><StatusBadge status={t.status} /><PriorityBadge priority={t.priority} />{t.overdue && <span className="badge b-overdue">SLA overdue</span>}</div></div>
      </div>
      <Msg kind="error">{error}</Msg><Msg kind="ok">{note}</Msg>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div>
          <div className="card">
            <h2>Problem</h2>
            <p style={{ marginTop: 0 }}>{t.description}</p>
            <dl className="kv">
              <dt>Reported by</dt><dd>{t.requester}</dd>
              <dt>Department</dt><dd>{t.department}</dd>
              <dt>Technician</dt><dd>{t.technician ? t.technician : <UnassignedBadge ticket={t} />}</dd>
              <dt>Created</dt><dd>{fmt(t.created_at)}</dd>
              <dt>SLA deadline</dt><dd>{fmt(t.sla_deadline)} · <Sla ticket={t} /></dd>
            </dl>
          </div>

          {t.status === 'Resolved' && (
            <div className="card soft"><h2>Resolution</h2><p style={{ margin: 0 }}>{t.resolution_text}</p>
              <p className="muted small" style={{ marginBottom: 0 }}>{t.resolution_verified ? 'Verified by a technician.' : 'Closed with a suggested fix (not yet verified by a technician).'}</p></div>
          )}

          {s && s.mode !== 'triage' && (
            <div className="card">
              <h2>What SmartDesk decided</h2>
              <dl className="kv">
                <dt>Mode</dt><dd>{s.mode === 'suggest' ? 'Suggested a past fix' : 'Routed by similar tickets'}</dd>
                <dt>Similarity</dt><dd>{s.similarity != null ? Number(s.similarity).toFixed(2) : '-'}</dd>
                <dt>Predicted dept.</dt><dd>{s.predicted_department || '-'}</dd>
                {s.source_ticket_id && (<><dt>Source ticket</dt><dd>#{s.source_ticket_id}</dd></>)}
                <dt>Your feedback</dt><dd>{s.helpful === null ? '-' : s.helpful ? 'Solved it' : 'Needed help'}</dd>
              </dl>
              {s.source_resolution && <div className="quote">{s.source_resolution}</div>}
              {s.explanation_status === 'ok' && <div className="quote"><span className="badge b-ai">AI explanation · {s.explanation_model}</span><p style={{ margin: '8px 0 0' }}>{s.explanation}</p></div>}
              {can.rate && (
                <div className="actions">
                  <button className="btn" onClick={() => act(() => api(`/api/tickets/${id}/feedback`, { method: 'POST', body: { helpful: true } }), 'Ticket closed with the suggested fix.')}>This solved it</button>
                  <button className="btn outline" onClick={() => act(() => api(`/api/tickets/${id}/feedback`, { method: 'POST', body: { helpful: false } }), 'Thanks for the feedback.')}>Still need help</button>
                </div>
              )}
            </div>
          )}
          {s?.mode === 'triage' && <Msg kind="info">No close match was found, so this ticket is waiting for an Admin to route it.</Msg>}
        </div>

        <div>
          <div className="card"><h2>History</h2><StatusTimeline items={timeline} /></div>

          {(can.start || can.resolve) && (
            <div className="card">
              <h2>Technician actions</h2>
              {can.start && <button className="btn outline" onClick={() => act(() => api(`/api/tickets/${id}`, { method: 'PATCH', body: { status: 'In Progress' } }), 'Marked as in progress.')}>Start work</button>}
              {can.resolve && (
                <div style={{ marginTop: can.start ? 14 : 0 }}>
                  <div className="field"><label>Resolution (what fixed it)</label>
                    <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Describe the fix so it can help the next person" /></div>
                  <button className="btn" onClick={() => act(() => api(`/api/tickets/${id}`, { method: 'PATCH', body: { status: 'Resolved', resolution_text: resolution } }), 'Ticket resolved. The fix is now searchable.')}>Resolve ticket</button>
                </div>
              )}
            </div>
          )}

          {(can.reassign || can.escalate) && meta && (
            <div className="card">
              <h2>Admin actions</h2>
              <div className="row">
                <div><label>Department</label>
                  <select value={adm.dept_id} onChange={(e) => setAdm({ ...adm, dept_id: e.target.value, tech_id: '' })}>
                    <option value="">Choose...</option>{meta.departments.map((d) => <option key={d.dept_id} value={d.dept_id}>{d.name}</option>)}</select></div>
                <div><label>Technician (optional)</label>
                  <select value={adm.tech_id} onChange={(e) => setAdm({ ...adm, tech_id: e.target.value })}>
                    <option value="">Auto (least loaded)</option>{techs.map((x) => <option key={x.tech_id} value={x.tech_id}>{x.name}</option>)}</select></div>
                <div className="auto"><button className="btn" disabled={!adm.dept_id}
                  onClick={() => act(() => api(`/api/admin/tickets/${id}/assign`, { method: 'PATCH', body: { action: 'reassign', dept_id: Number(adm.dept_id), ...(adm.tech_id ? { tech_id: Number(adm.tech_id) } : {}) } }), 'Ticket reassigned.')}>Reassign</button></div>
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                <div><label>Escalate to priority</label>
                  <select value={adm.priority} onChange={(e) => setAdm({ ...adm, priority: e.target.value })}>
                    <option value="">Choose...</option>{meta.priorities.map((p) => <option key={p.priority}>{p.priority}</option>)}</select></div>
                <div className="auto"><button className="btn outline" disabled={!adm.priority}
                  onClick={() => act(() => api(`/api/admin/tickets/${id}/assign`, { method: 'PATCH', body: { action: 'escalate', priority: adm.priority } }), 'Ticket escalated.')}>Escalate</button></div>
              </div>
            </div>
          )}

          {(can.reopen || can.withdraw) && (
            <div className="card">
              <h2>Your options</h2>
              <div className="actions" style={{ marginTop: 0 }}>
                {can.reopen && <button className="btn outline" onClick={() => act(() => api(`/api/tickets/${id}/reopen`, { method: 'POST' }), 'Ticket reopened and assigned again.')}>Still broken? Reopen</button>}
                {can.withdraw && <button className="btn danger" onClick={() => { if (confirm('Withdraw (delete) this ticket?')) act(async () => { await api(`/api/tickets/${id}`, { method: 'DELETE' }); router.push('/tickets'); }); }}>Withdraw ticket</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
