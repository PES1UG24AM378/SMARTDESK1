import { withErrors, HttpError } from '@/lib/errors.js';
import { requireUser } from '@/lib/auth.js';
import { reopenTicket } from '@/lib/ticketService.js';

export const dynamic = 'force-dynamic';   // always evaluated per request (uses cookies), never pre-rendered

export const POST = withErrors(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await ctx.params;
  if (!Number.isInteger(Number(id))) throw new HttpError(404, 'Ticket not found');
  return Response.json(await reopenTicket(user, Number(id)));
});
