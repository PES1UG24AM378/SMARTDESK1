'use client';
import { useState } from 'react';
import { api, errText } from '@/components/api.js';
import { Msg } from '@/components/ui.js';

const HOME = { Employee: '/tickets', Technician: '/technician', Admin: '/admin' };
const DEMO = process.env.NEXT_PUBLIC_DEMO_HINTS === 'true';
const ACCOUNTS = [
  ['Employee', 'aarav.sharma@smartdesk.example'],
  ['Technician', 'suresh.kumar@smartdesk.example'],
  ['Admin', 'admin1@smartdesk.example'],
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const d = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      window.location.href = HOME[d.user.role];
    } catch (err) { setError(errText(err)); setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-brand">
        <span className="logo">SmartDesk</span>
        <p className="muted">Semantic IT &amp; Facilities Helpdesk</p>
      </div>
      <div className="card">
        <h2>Sign in</h2>
        <Msg kind="error">{error}</Msg>
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></div>
          <div className="field"><label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></div>
          <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        </form>
        {DEMO && (
          <>
            <p className="muted small" style={{ marginTop: 18, marginBottom: 0 }}>Demo accounts (password <b>Password@123</b>):</p>
            <div className="demo-buttons">
              {ACCOUNTS.map(([role, mail]) => (
                <button key={role} type="button" className="btn outline small" onClick={() => { setEmail(mail); setPassword('Password@123'); }}>{role}</button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
