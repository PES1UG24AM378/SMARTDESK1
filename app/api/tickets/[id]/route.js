import { withErrors, HttpError } from '@/lib/errors.js';
import { requireUser } from '@/lib/auth.js';
import { updateTicketSchema } from '@/lib/validate.js';
import { getTicket, updateTicket, withdrawTicket } from '@/lib/ticketService.js';

export const dynamic = 'force-dynamic';   // always evaluated per request (uses cookies), never pre-rendered

async function idOf(ctx) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'Ticket not found');
  return n;
}

export const GET = withErrors(async (request, ctx) => {
  const user = await requireUser(request);
  return Response.json(await getTicket(user, await idOf(ctx)));
});

export const PATCH = withErrors(async (request, ctx) => {
  const user = await requireUser(request, ['Technician', 'Admin']);
  const body = updateTicketSchema.parse(await request.json());
  return Response.json(await updateTicket(user, await idOf(ctx), body));
});

// Withdraw = real DELETE (only your own ticket, only while it is still Open)
export const DELETE = withErrors(async (request, ctx) => {
  const user = await requireUser(request);
  return Response.json(await withdrawTicket(user, await idOf(ctx)));
});
