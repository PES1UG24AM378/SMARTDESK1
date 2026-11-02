'use client';
import { useEffect } from 'react';
import { api } from '@/components/api.js';

const HOME = { Employee: '/tickets', Technician: '/technician', Admin: '/admin' };

export default function Home() {
  useEffect(() => {
    api('/api/me').then((d) => { window.location.replace(HOME[d.user.role]); }).catch(() => { window.location.replace('/login'); });
  }, []);
  return <p className="muted">Loading...</p>;
}
