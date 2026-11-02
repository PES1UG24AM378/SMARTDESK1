import { withErrors, HttpError } from '@/lib/errors.js';
import { requireUser } from '@/lib/auth.js';
import { runSlaScan } from '@/lib/adminService.js';

export const dynamic = 'force-dynamic';   // always evaluated per request (uses cookies), never pre-rendered

// Run by an Admin from the dashboard, or by a scheduler that sends the x-cron-secret header.
export const POST = withErrors(async (request) => {
  const secret = process.env.CRON_SECRET;
  const cronHeader = request.headers.get('x-cron-secret');

  if (cronHeader) {
    if (!secret || cronHeader !== secret) {
      throw new HttpError(401, 'Invalid cron secret');
    }
  } else {
    await requireUser(request, ['Admin']);
  }
  return Response.json(await runSlaScan());
});
