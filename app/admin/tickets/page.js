'use client';
import { useEffect, useState, useCallback } from 'react';
import { api, errText } from '@/components/api.js';
import TicketTable from '@/components/TicketTable.js';
import { Msg } from '@/components/ui.js';

export default function AllTickets() {
  const [tickets, setTickets] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ q: '', status: '', priority: '', dept_id: '', scope: '' });

  const load = useCallback(async (filters) => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    try { setTickets((await api(`/api/tickets${qs ? '?' + qs : ''}`)).tickets); setError(''); } catch (e) { setError(errText(e)); }
  }, []);
  useEffect(() => { load(f); api('/api/meta').then(setMeta); /* eslint-disable-next-line */ }, []);
  const apply = (patch) => { const n = { ...f, ...patch }; setF(n); load(n); };

  return (
    <>
      <div className="page-head"><div><h1>All tickets</h1><p className="muted" style={{ margin: 0 }}>Search and filter every ticket in the system.</p></div></div>
      <div className="card">
        <form className="row" onSubmit={(e) => { e.preventDefault(); load(f); }}>
          <div><label>Search</label><input placeholder="text in problem or resolution" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
          <div><label>View</label><select value={f.scope} onChange={(e) => apply({ scope: e.target.value })}>
            <option value="">All tickets</option><option value="triage">Triage queue</option><option value="unassigned">Unassigned</option><option value="queue">Active by deadline</option></select></div>
          <div><label>Status</label><select value={f.status} onChange={(e) => apply({ status: e.target.value })}>
            <option value="">All</option><option>Open</option><option>In Progress</option><option>Resolved</option></select></div>
          <div><label>Priority</label><select value={f.priority} onChange={(e) => apply({ priority: e.target.value })}>
            <option value="">All</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></div>
          <div><label>Department</label><select value={f.dept_id} onChange={(e) => apply({ dept_id: e.target.value })}>
            <option value="">All</option>{meta?.departments.map((d) => <option key={d.dept_id} value={d.dept_id}>{d.name}</option>)}</select></div>
          <div className="auto"><button className="btn">Search</button></div>
        </form>
      </div>
      <div className="card"><Msg kind="error">{error}</Msg><TicketTable tickets={tickets} showRequester /></div>
    </>
  );
}
