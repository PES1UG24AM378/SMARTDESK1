import bcrypt from 'bcryptjs';
import { query } from '@/lib/db.js';
import { withErrors, HttpError } from '@/lib/errors.js';
import { signToken, setCookieHeader } from '@/lib/auth.js';
import { loginSchema } from '@/lib/validate.js';
import { isBlocked, recordFailure, clearFailures } from '@/lib/rateLimit.js';

export const dynamic = 'force-dynamic';   // always evaluated per request (uses cookies), never pre-rendered

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);   // keeps timing the same for unknown emails

export const POST = withErrors(async (request) => {
  const { email, password } = loginSchema.parse(await request.json());
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local';
  const key = `${ip}|${email}`;
  const wait = isBlocked(key);
  if (wait) throw new HttpError(429, `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`);

  const { rows } = await query(
    'SELECT user_id, name, role, password_hash, is_active FROM users WHERE email = $1', [email]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !user.is_active || !ok) {
    recordFailure(key);
    throw new HttpError(401, 'Invalid email or password');   // same message for every failure
  }
  clearFailures(key);
  const res = Response.json({ user: { name: user.name, role: user.role } });
  res.headers.append('Set-Cookie', setCookieHeader(signToken({ user_id: user.user_id })));
  return res;
});
