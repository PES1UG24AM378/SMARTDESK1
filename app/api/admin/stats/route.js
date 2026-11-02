import { withErrors } from '@/lib/errors.js';
import { requireUser } from '@/lib/auth.js';
import { getStats } from '@/lib/adminService.js';

export const dynamic = 'force-dynamic';   // always evaluated per request (uses cookies), never pre-rendered

export const GET = withErrors(async (request) => {
  await requireUser(request, ['Admin']);
  return Response.json(await getStats());
});
