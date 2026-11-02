'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api, errText } from '@/components/api.js';
import TicketTable from '@/components/TicketTable.js';
import { Msg, Stat } from '@/components/ui.js';

export default function Technician() {
  const [tab, setTab] = useState('queue');
  const [queue, setQueue] = useState(null);
  const [dept, setDept] = useState(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const inFlight = useRef(false);

  const load = useCallback(async (isBackground = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [queueRes, deptRes] = await Promise.all([
        api('/api/tickets?scope=queue'),
        api('/api/tickets'),
      ]);
      setQueue(queueRes.tickets);
      setDept(deptRes.tickets);
      setLastUpdated(new Date());
      setError('');
    } catch (e) {
      if (!isBackground) setError(errText(e));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    load(false);
    const timer = setInterval(() => load(true), 30000);
    return () => clearInterval(timer);
  }, [load]);

  const overdue = queue?.filter((t) => t.overdue).length;
  const inProg = queue?.filter((t) => t.status === 'In Progress').length;
  const resolved = dept?.filter((t) => t.status === 'Resolved').length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My queue</h1>
          <p className="muted" style={{ margin: 0 }}>Tickets assigned to you, nearest deadline first.</p>
        </div>
        {lastUpdated && (
          <span className="muted small" title="Refreshes automatically every 30 seconds">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>
      <div className="grid cols-3" style={{ marginBottom: 18 }}>
        <Stat label="Assigned to me (active)" value={queue?.length} />
        <Stat label="In progress" value={inProg} />
        <Stat label="Overdue" value={overdue} alert={overdue > 0} />
      </div>
      <div className="tabs">
        <button className={`tab ${tab === 'queue' ? 'on' : ''}`} onClick={() => setTab('queue')}>My queue</button>
        <button className={`tab ${tab === 'dept' ? 'on' : ''}`} onClick={() => setTab('dept')}>Department tickets {resolved != null && `(${resolved} resolved)`}</button>
      </div>
      <div className="card">
        <Msg kind="error">{error}</Msg>
        {tab === 'queue'
          ? <TicketTable tickets={queue} showRequester empty="Nothing in your queue. Nice work." />
          : <TicketTable tickets={dept} showRequester empty="No tickets in your department." />}
      </div>
    </>
  );
}
