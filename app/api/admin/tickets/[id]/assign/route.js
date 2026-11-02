import { withErrors, HttpError } from '@/lib/errors.js';
import { requireUser } from '@/lib/auth.js';
import { assignSchema } from '@/lib/validate.js';
import { adminTicketAction } from '@/lib/adminService.js';

export const dynamic = 'force-dynamic';   // always evaluated per request (uses cookies), never pre-rendered

// Admin only: reassign department/technician, or escalate priority (escalate_ticket procedure).
export const PATCH = withErrors(async (request, ctx) => {
  const admin = await requireUser(request, ['Admin']);
  const { id } = await ctx.params;
  if (!Number.isInteger(Number(id))) throw new HttpError(404, 'Ticket not found');
  const body = assignSchema.parse(await request.json());
  return Response.json(await adminTicketAction(admin, Number(id), body));
});
