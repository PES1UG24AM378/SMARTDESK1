import { withErrors, HttpError } from '@/lib/errors.js';
import { requireUser } from '@/lib/auth.js';
import { feedbackSchema } from '@/lib/validate.js';
import { submitFeedback } from '@/lib/ticketService.js';

export const dynamic = 'force-dynamic';   // always evaluated per request (uses cookies), never pre-rendered

export const POST = withErrors(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await ctx.params;
  if (!Number.isInteger(Number(id))) throw new HttpError(404, 'Ticket not found');
  const { helpful } = feedbackSchema.parse(await request.json());
  return Response.json(await submitFeedback(user, Number(id), helpful));
});
