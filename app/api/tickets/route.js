import { withErrors } from '@/lib/errors.js';
import { requireUser } from '@/lib/auth.js';
import { ticketSchema, listSchema, parseQuery } from '@/lib/validate.js';
import { createTicket, listStaff } from '@/lib/ticketService.js';

export const dynamic = 'force-dynamic';   // always evaluated per request (uses cookies), never pre-rendered

// Technician: their department. Admin: everything. Employees use /api/tickets/mine.
export const GET = withErrors(async (request) => {
  const user = await requireUser(request, ['Technician', 'Admin']);
  const filters = parseQuery(request, listSchema);
  return Response.json({ tickets: await listStaff(user, filters) });
});

export const POST = withErrors(async (request) => {
  const user = await requireUser(request);
  const input = ticketSchema.parse(await request.json());
  return Response.json(await createTicket(user, input), { status: 201 });
});
