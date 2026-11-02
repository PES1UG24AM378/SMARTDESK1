import { withErrors } from '@/lib/errors.js';
import { clearCookieHeader } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';   // always evaluated per request (uses cookies), never pre-rendered

export const POST = withErrors(async () => {
  const res = Response.json({ ok: true });
  res.headers.append('Set-Cookie', clearCookieHeader());
  return res;
});
