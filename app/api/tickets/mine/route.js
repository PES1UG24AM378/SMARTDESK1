import { withErrors } from '@/lib/errors.js';
import { requireUser } from '@/lib/auth.js';
import { listSchema, parseQuery } from '@/lib/validate.js';
import { listMine } from '@/lib/ticketService.js';

export const dynamic = 'force-dynamic';   // always evaluated per request (uses cookies), never pre-rendered

// Always the signed-in user's own tickets. There is deliberately no userId parameter.
export const GET = withErrors(async (request) => {
  const user = await requireUser(request);
  return Response.json({ tickets: await listMine(user, parseQuery(request, listSchema)) });
});
