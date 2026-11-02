import { withErrors } from '@/lib/errors.js';
import { requireUser } from '@/lib/auth.js';
import { getAlerts } from '@/lib/adminService.js';

export const dynamic = 'force-dynamic';   // always evaluated per request (uses cookies), never pre-rendered

export const GET = withErrors(async (request) => {
  await requireUser(request, ['Admin']);
  const active = new URL(request.url).searchParams.get('active') === 'true';
  return Response.json({ alerts: await getAlerts(active) });
});
