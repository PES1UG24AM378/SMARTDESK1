'use client';
import { useEffect, useState, useCallback } from 'react';
import { api, errText } from '@/components/api.js';
import { Msg, fmt } from '@/components/ui.js';

export default function Users() {
  const [users, setUsers] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'Employee', dept_id: '' });

  const load = useCallback(() => api('/api/admin/users').then((d) => setUsers(d.users)).catch((e) => setError(errText(e))), []);
  useEffect(() => { load(); api('/api/meta').then(setMeta); }, [load]);

  async function create(e) {
    e.preventDefault(); setError(''); setOk('');
    try {
      await api('/api/admin/users', { method: 'POST', body: { ...form, dept_id: form.dept_id ? Number(form.dept_id) : undefined } });
      setOk(`Account created for ${form.name}.`); setForm({ name: '', email: '', password: '', role: 'Employee', dept_id: '' }); load();
    } catch (err) { setError(errText(err)); }
  }
  async function toggle(u) {
    setError(''); setOk('');
    try { await api(`/api/admin/users/${u.user_id}`, { method: 'PATCH', body: { is_active: !u.is_active } }); load(); }
    catch (err) { setError(errText(err)); }
  }

  return (
    <>
      <div className="page-head"><div><h1>Users</h1><p className="muted" style={{ margin: 0 }}>Create accounts and deactivate people who have left. There is no self-registration.</p></div></div>
      <div className="card">
        <h2>Add a user</h2>
        <Msg kind="error">{error}</Msg><Msg kind="ok">{ok}</Msg>
        <form onSubmit={create}>
          <div className="row">
            <div><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
            <div><label>Temporary password (10+ chars)</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={10} /></div>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <div><label>Role</label><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option>Employee</option><option>Technician</option><option>Admin</option></select></div>
            {form.role === 'Technician' && (
              <div><label>Department</label><select value={form.dept_id} onChange={(e) => setForm({ ...form, dept_id: e.target.value })} required>
                <option value="">Choose...</option>{meta?.departments.filter((d) => d.name !== 'Triage').map((d) => <option key={d.dept_id} value={d.dept_id}>{d.name}</option>)}</select></div>
            )}
            <div className="auto"><button className="btn">Create user</button></div>
          </div>
        </form>
      </div>
      <div className="card">
        <h2>All users</h2>
        {!users ? <p className="muted">Loading...</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Active tickets</th><th>Status</th><th></th></tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.user_id}>
                <td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.department || '-'}</td>
                <td>{u.role === 'Technician' ? u.active_tickets : '-'}</td>
                <td>{u.is_active ? <span className="badge b-resolved">Active</span> : <span className="badge b-low">Deactivated</span>}</td>
                <td className="right"><button className={`btn small ${u.is_active ? 'danger' : 'outline'}`} onClick={() => toggle(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</button></td>
              </tr>))}</tbody></table></div>
        )}
      </div>
    </>
  );
}
