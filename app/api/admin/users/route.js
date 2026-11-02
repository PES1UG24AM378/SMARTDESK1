import { withErrors } from '@/lib/errors.js';
import { requireUser } from '@/lib/auth.js';
import { userCreateSchema } from '@/lib/validate.js';
import { listUsers, createUser } from '@/lib/adminService.js';

export const dynamic = 'force-dynamic';   // always evaluated per request (uses cookies), never pre-rendered

export const GET = withErrors(async (request) => {
  await requireUser(request, ['Admin']);
  return Response.json({ users: await listUsers() });
});

export const POST = withErrors(async (request) => {
  const admin = await requireUser(request, ['Admin']);
  const body = userCreateSchema.parse(await request.json());
  return Response.json(await createUser(admin, body), { status: 201 });
});
