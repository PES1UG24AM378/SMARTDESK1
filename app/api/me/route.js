import { withErrors } from '@/lib/errors.js';
import { requireUser } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';   // always evaluated per request (uses cookies), never pre-rendered

export const GET = withErrors(async (request) => {
  const u = await requireUser(request);
  return Response.json({ user: { id: u.user_id, name: u.name, email: u.email, role: u.role, dept_id: u.dept_id ?? null } });
});
