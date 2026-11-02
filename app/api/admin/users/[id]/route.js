import { withErrors, HttpError } from '@/lib/errors.js';
import { requireUser } from '@/lib/auth.js';
import { userPatchSchema } from '@/lib/validate.js';
import { setUserActive } from '@/lib/adminService.js';

export const dynamic = 'force-dynamic';   // always evaluated per request (uses cookies), never pre-rendered

export const PATCH = withErrors(async (request, ctx) => {
  const admin = await requireUser(request, ['Admin']);
  const { id } = await ctx.params;
  if (!Number.isInteger(Number(id))) throw new HttpError(404, 'User not found');
  const { is_active } = userPatchSchema.parse(await request.json());
  return Response.json(await setUserActive(admin, Number(id), is_active));
});
