import { withErrors, HttpError } from '@/lib/errors.js';
import { requireUser } from '@/lib/auth.js';
import { generateExplanation } from '@/lib/ticketService.js';

export const dynamic = 'force-dynamic';   // always evaluated per request (uses cookies), never pre-rendered

// Gemini explanation (RAG). Owner or Admin only. Cached per ticket after the first call.
export const POST = withErrors(async (request, ctx) => {
  const user = await requireUser(request);
  const { id } = await ctx.params;
  if (!Number.isInteger(Number(id))) throw new HttpError(404, 'Ticket not found');
  return Response.json(await generateExplanation(user, Number(id)));
});
