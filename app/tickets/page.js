'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, errText } from '@/components/api.js';
import TicketTable from '@/components/TicketTable.js';
import { Msg } from '@/components/ui.js';

export default function MyTickets() {
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ q: '', status: '', priority: '' });

  const load = useCallback(async (filters) => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    try { setTickets((await api(`/api/tickets/mine${qs ? '?' + qs : ''}`)).tickets); setError(''); }
    catch (e) { setError(errText(e)); }
  }, []);
  useEffect(() => { load(f); /* eslint-disable-next-line */ }, []);

  const apply = (patch) => { const n = { ...f, ...patch }; setF(n); load(n); };

  return (
    <>
      <div className="page-head">
        <div><h1>My tickets</h1><p className="muted" style={{ margin: 0 }}>Everything you have reported and its progress.</p></div>
        <Link href="/tickets/new" className="btn">New ticket</Link>
      </div>
      <div className="card">
        <form className="row" onSubmit={(e) => { e.preventDefault(); load(f); }}>
          <div><label>Search</label><input placeholder="e.g. printer, wifi" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
          <div><label>Status</label>
            <select value={f.status} onChange={(e) => apply({ status: e.target.value })}>
              <option value="">All</option><option>Open</option><option>In Progress</option><option>Resolved</option></select></div>
          <div><label>Priority</label>
            <select value={f.priority} onChange={(e) => apply({ priority: e.target.value })}>
              <option value="">All</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></div>
          <div className="auto"><button className="btn">Search</button></div>
        </form>
      </div>
      <div className="card">
        <Msg kind="error">{error}</Msg>
        <TicketTable tickets={tickets} empty="You have no tickets yet. Report a problem with New ticket." />
      </div>
    </>
  );
}
