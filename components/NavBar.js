'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from './api.js';

const LINKS = {
  Employee: [['/tickets', 'My tickets'], ['/tickets/new', 'New ticket']],
  Technician: [['/technician', 'My queue'], ['/tickets', 'My tickets'], ['/tickets/new', 'New ticket']],
  Admin: [['/admin', 'Dashboard'], ['/admin/tickets', 'All tickets'], ['/admin/users', 'Users'], ['/tickets/new', 'New ticket']],
};

export default function NavBar() {
  const path = usePathname();
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (path.startsWith('/login')) { setUser(null); return; }
    api('/api/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  }, [path]);

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">SmartDesk</Link>
        <nav className="nav-links">
          {user && LINKS[user.role].map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? 'active' : ''}>{label}</Link>
          ))}
        </nav>
        {user && (
          <div className="nav-user">
            <span>{user.name} · {user.role}</span>
            <button onClick={logout}>Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}
