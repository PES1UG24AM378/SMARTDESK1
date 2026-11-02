'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { api, errText } from '@/components/api.js';
import TicketTable from '@/components/TicketTable.js';
import { Msg, Stat, Bars, fmt, PriorityBadge, StatusBadge, UnassignedBadge } from '@/components/ui.js';

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [queue, setQueue] = useState(null);
  const [meta, setMeta] = useState(null);
  const [tab, setTab] = useState('triage');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const inFlight = useRef(false);

  const load = useCallback(async (isBackground = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (isBackground) setIsRefreshing(true);

    try {
      const [statsRes, alertsRes, queueRes] = await Promise.all([
        api('/api/admin/stats'),
        api('/api/admin/alerts?active=true'),
        api(`/api/tickets?scope=${tab}`),
      ]);
      setS(statsRes);
      setAlerts(alertsRes.alerts);
      setQueue(queueRes.tickets);
      setLastUpdated(new Date());
      setError('');
    } catch (e) {
      if (!isBackground) setError(errText(e));
    } finally {
      inFlight.current = false;
      setIsRefreshing(false);
    }
  }, [tab]);

  // Initial load and 30-second automatic polling
  useEffect(() => {
    load(false);
    api('/api/meta').then(setMeta).catch(() => {});

    const timer = setInterval(() => {
      load(true);
    }, 30000);

    return () => clearInterval(timer);
  }, [load]);

  async function scan() {
    setNote(''); setError('');
    try {
      const r = await api('/api/admin/sla-scan', { method: 'POST' });
      setNote(`SLA scan finished: ${r.newAlerts} new alert(s) generated.`);
      await load(true);
    } catch (e) {
      setError(errText(e));
    }
  }

  async function handleAssign(ticketId, { dept_id, tech_id }) {
    setNote(''); setError('');
    try {
      await api(`/api/admin/tickets/${ticketId}/assign`, {
        method: 'PATCH',
        body: { action: 'reassign', dept_id, tech_id },
      });
      setNote(`Ticket #${ticketId} assigned successfully.`);
      await load(true);
    } catch (e) {
      setError(errText(e));
    }
  }

  const k = s?.kpi;
  const p = s?.performance;
  const statusItems = s ? ['Open', 'In Progress', 'Resolved'].map((x) => ({ label: x, value: s.status.find((r) => r.status === x)?.count ?? 0 })) : [];
  const prioItems = s ? ['Critical', 'High', 'Medium', 'Low'].map((x) => ({ label: x, value: s.priority.find((r) => r.priority === x)?.count ?? 0 })) : [];
  const deflection = p && p.suggest_mode ? Math.round((100 * p.deflected) / p.suggest_mode) : null;

  const emptyText = tab === 'triage'
    ? 'No tickets in triage queue. The AI routed all incoming tickets.'
    : 'No unassigned tickets waiting. All open tickets are assigned to technicians.';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted" style={{ margin: 0 }}>
            Live view of tickets, workload, deadlines and how the AI layer is doing.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {isRefreshing ? (
            <span className="refresh-indicator"><span className="spinner" /> Refreshing...</span>
          ) : lastUpdated ? (
            <span className="muted small" title="Refreshes automatically every 30 seconds">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          ) : null}
          <button className="btn outline" onClick={scan}>Run SLA scan</button>
        </div>
      </div>
      <Msg kind="error">{error}</Msg>
      <Msg kind="ok">{note}</Msg>

      <div className="grid cols-6" style={{ marginBottom: 18 }}>
        <Stat label="Total tickets" value={k?.total} />
        <Stat label="Active" value={k?.active} />
        <Stat label="Overdue" value={k?.overdue} alert={k?.overdue > 0} />
        <Stat label="Unassigned" value={k?.unassigned} alert={k?.unassigned > 0} />
        <Stat label="Avg resolution (h)" value={k?.avg_resolution_hours} />
        <Stat label="Active SLA alerts" value={s?.activeAlerts} alert={s?.activeAlerts > 0} />
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card"><h2>Tickets by status</h2><Bars items={statusItems} /></div>
        <div className="card"><h2>Active tickets by priority</h2><Bars items={prioItems} red /></div>
      </div>

      <div className="card">
        <h2>Needs attention</h2>
        <div className="tabs">
          <button className={`tab ${tab === 'triage' ? 'on' : ''}`} onClick={() => setTab('triage')}>Triage queue</button>
          <button className={`tab ${tab === 'unassigned' ? 'on' : ''}`} onClick={() => setTab('unassigned')}>Unassigned</button>
        </div>
        <TicketTable
          tickets={queue}
          showRequester
          empty={emptyText}
          meta={meta}
          showAssign={true}
          onAssign={handleAssign}
        />
      </div>

      <div className="card">
        <h2>AI layer</h2>
        <div className="grid cols-6">
          <Stat label="Decisions" value={p?.total_decisions ?? 0} />
          <Stat label="Suggested a fix" value={p?.suggest_mode ?? 0} />
          <Stat label="Routed" value={p?.route_mode ?? 0} />
          <Stat label="Triage" value={p?.triage_mode ?? 0} />
          <Stat label="Solved by employee (deflection)" value={deflection != null ? `${deflection}%` : '-'} />
          <Stat label="Routing accuracy" value={p?.routing_accuracy_pct != null ? `${p.routing_accuracy_pct}%` : '-'} />
        </div>
        <h3 style={{ marginTop: 18 }}>Recurring issues (fix suggested 2+ times in 30 days)</h3>
        {s?.recurring.length ? (
          <div className="table-wrap"><table><thead><tr><th>Source ticket</th><th>Department</th><th>Fix</th><th>Times</th><th>Last</th></tr></thead>
            <tbody>{s.recurring.map((r) => (<tr key={r.source_ticket_id}><td><Link href={`/tickets/${r.source_ticket_id}`}>#{r.source_ticket_id}</Link></td><td>{r.department}</td><td>{r.resolution_preview}</td><td>{r.times_suggested}</td><td className="muted">{fmt(r.last_suggested)}</td></tr>))}</tbody></table></div>
        ) : <p className="muted">None yet. They appear when the same past fix is suggested repeatedly.</p>}
      </div>

      <div className="card">
        <h2>Technician workload</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Technician</th><th>Department</th><th>Open</th><th>In progress</th><th>Overdue</th><th>Resolved</th><th>Avg resolution (h)</th></tr></thead>
          <tbody>{s?.workload.map((w) => (<tr key={w.tech_id}><td>{w.technician}</td><td>{w.department}</td><td>{w.open_tickets}</td><td>{w.in_progress}</td>
            <td>{w.overdue > 0 ? <span className="badge b-overdue">{w.overdue}</span> : 0}</td><td>{w.resolved_tickets}</td><td>{w.avg_resolution_hours ?? '-'}</td></tr>))}</tbody></table></div>
      </div>

      <div className="card">
        <h2>By department</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Department</th><th>Total</th><th>Active</th><th>Resolved</th><th>Avg resolution (h)</th><th>SLA breaches</th></tr></thead>
          <tbody>{s?.summary.map((d) => (<tr key={d.dept_id}><td>{d.department}</td><td>{d.total_tickets}</td><td>{d.active_tickets}</td><td>{d.resolved_tickets}</td><td>{d.avg_resolution_hours ?? '-'}</td><td>{d.sla_breaches}</td></tr>))}</tbody></table></div>
      </div>

      <div className="card">
        <h2>Active SLA alerts</h2>
        {!alerts?.length ? <p className="muted">No active alerts.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Ticket</th><th>Problem</th><th>Department</th><th>Technician</th><th>Priority</th><th>Status</th><th>Deadline</th><th>Raised</th></tr></thead>
            <tbody>{alerts.slice(0, 15).map((a) => (<tr key={a.alert_id}><td><Link href={`/tickets/${a.ticket_id}`}>#{a.ticket_id}</Link></td><td>{a.description}</td><td>{a.department}</td>
              <td>{a.technician ? a.technician : <UnassignedBadge ticket={a} />}</td><td><PriorityBadge priority={a.priority} /></td><td><StatusBadge status={a.status} /></td>
              <td>{fmt(a.sla_deadline)}</td><td className="muted">{fmt(a.created_at)}</td></tr>))}</tbody></table></div>
        )}
      </div>
    </>
  );
}
