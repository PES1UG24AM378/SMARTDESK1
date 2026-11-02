'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, errText } from '@/components/api.js';
import { Msg, fmt } from '@/components/ui.js';
import SuggestionCard from '@/components/SuggestionCard.js';

export default function NewTicket() {
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { setResult(await api('/api/tickets', { method: 'POST', body: { description, priority } })); }
    catch (err) { setError(errText(err)); }
    setBusy(false);
  }

  if (result) {
    return (
      <>
        <div className="page-head"><div><h1>Ticket #{result.ticket_id} created</h1>
          <p className="muted" style={{ margin: 0 }}>{result.department.name} · {result.technician ? `assigned to ${result.technician}` : 'waiting for assignment'} · due {fmt(result.sla_deadline)}</p></div></div>
        <SuggestionCard info={result} canRate />
        <div className="actions">
          <Link href={`/tickets/${result.ticket_id}`} className="btn">View ticket</Link>
          <button className="btn outline" onClick={() => { setResult(null); setDescription(''); }}>Report another problem</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head"><div><h1>Report a problem</h1><p className="muted" style={{ margin: 0 }}>Describe it in your own words. SmartDesk looks for similar problems that were solved before.</p></div></div>
      <div className="card" style={{ maxWidth: 720 }}>
        <Msg kind="error">{error}</Msg>
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="d">What is the problem?</label>
            <textarea id="d" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000}
              placeholder="e.g. Wi-Fi keeps dropping in the 3rd floor lab" required /></div>
          <div className="field" style={{ maxWidth: 240 }}><label htmlFor="p">Priority</label>
            <select id="p" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></div>
          <p className="muted small">Please do not include passwords or personal data.</p>
          <button className="btn" disabled={busy}>{busy ? 'Searching for similar problems...' : 'Submit ticket'}</button>
        </form>
      </div>
    </>
  );
}
