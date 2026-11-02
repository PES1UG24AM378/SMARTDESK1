'use client';
import { useEffect, useState } from 'react';
import { api, errText } from './api.js';
import { Msg } from './ui.js';

// Shows what the system decided for a ticket: suggested fix, AI explanation (Gemini), feedback buttons.
// `info` = { ticket_id, mode, reason, similarity, source, similarOpen, department, technician }
export default function SuggestionCard({ info, canRate, onChanged }) {
  const [expl, setExpl] = useState(null);       // { status, text, model }
  const [rated, setRated] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (info.mode !== 'suggest') return;
    api(`/api/tickets/${info.ticket_id}/explanation`, { method: 'POST' }).then(setExpl).catch(() => setExpl({ status: 'error' }));
  }, [info.ticket_id, info.mode]);

  async function rate(helpful) {
    setBusy(true); setError('');
    try {
      const r = await api(`/api/tickets/${info.ticket_id}/feedback`, { method: 'POST', body: { helpful } });
      setRated(helpful ? (r.resolved ? 'solved' : 'thanks') : 'help');
      onChanged?.();
    } catch (e) { setError(errText(e)); }
    setBusy(false);
  }

  const modeText = { suggest: 'Suggested fix found', route: 'Routed to the right team', triage: 'Sent to an Admin for routing' }[info.mode];
  return (
    <div className="card soft">
      <h2>{modeText}{info.similarity != null && <span className="badge b-ai">similarity {Number(info.similarity).toFixed(2)}</span>}</h2>
      <p style={{ marginTop: 0 }}>{info.reason}</p>

      {info.similarOpen?.reports > 0 && (
        <Msg kind="info">{info.similarOpen.reports} similar open report{info.similarOpen.reports > 1 ? 's' : ''} from the last 48 hours. This may be a known outage.</Msg>
      )}

      {info.mode === 'suggest' && info.source && (
        <>
          <h3>A similar problem was solved before (ticket #{info.source.ticket_id})</h3>
          <div className="quote"><div className="muted small">{info.source.description}</div>{info.source.resolution_text}</div>
          {expl?.status === 'ok' && (
            <div className="quote">
              <span className="badge b-ai">AI explanation · {expl.model}</span>
              <p style={{ margin: '8px 0 0' }}>{expl.text}</p>
            </div>
          )}
          {expl === null && <p className="muted small">Preparing an explanation...</p>}
        </>
      )}

      {error && <Msg kind="error">{error}</Msg>}
      {info.mode === 'suggest' && canRate && !rated && (
        <div className="actions">
          <button className="btn" disabled={busy} onClick={() => rate(true)}>This solved it</button>
          <button className="btn outline" disabled={busy} onClick={() => rate(false)}>Still need help</button>
        </div>
      )}
      {rated === 'solved' && <Msg kind="ok">Great. The ticket was closed with this fix. You can reopen it any time.</Msg>}
      {rated === 'help' && <Msg kind="info">Thanks. A technician will take it from here.</Msg>}
    </div>
  );
}
