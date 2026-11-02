import { withErrors } from '@/lib/errors.js';
import { requireUser } from '@/lib/auth.js';
import { listMeta } from '@/lib/ticketService.js';
import { query } from '@/lib/db.js';

export const dynamic = 'force-dynamic';   // always evaluated per request (uses cookies), never pre-rendered

export const GET = withErrors(async (request) => {
  const u = await requireUser(request);
  const meta = await listMeta();
  if (u.role === 'Admin') {
    meta.technicians = (await query(
      `SELECT t.tech_id, t.dept_id, us.name FROM technicians t JOIN users us ON us.user_id = t.user_id WHERE us.is_active ORDER BY us.name`)).rows;
  }
  return Response.json(meta);
});
