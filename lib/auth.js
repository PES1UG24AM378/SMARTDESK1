// Authentication (bcrypt + signed cookie) and authorization (roles).
import jwt from 'jsonwebtoken';
import { query } from './db.js';
import { HttpError } from './errors.js';

export const COOKIE = 'sd_token';
const MAX_AGE = 8 * 3600; // 8 hours

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be set to a random string of at least 32 characters');
  return s;
}

export const signToken = (payload, expiresIn = '8h') => jwt.sign(payload, secret(), { expiresIn });

export function verifyToken(token) {
  try { return jwt.verify(token, secret()); } catch { return null; }
}

export function setCookieHeader(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}${secure}`;
}
export const clearCookieHeader = () => `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;

/**
 * Returns the signed-in user or throws 401/403.
 * The user row is re-read on every request, so deactivation and role
 * changes take effect immediately (the token only carries the user id).
 */
export async function requireUser(request, roles = null) {
  const token = request.cookies.get(COOKIE)?.value;
  const payload = token ? verifyToken(token) : null;
  if (!payload?.user_id) throw new HttpError(401, 'Please sign in');

  const { rows } = await query(
    `SELECT u.user_id, u.name, u.email, u.role, t.tech_id, t.dept_id
       FROM users u LEFT JOIN technicians t ON t.user_id = u.user_id
      WHERE u.user_id = $1 AND u.is_active`,
    [payload.user_id]);
  if (!rows[0]) throw new HttpError(401, 'Please sign in');
  if (roles && !roles.includes(rows[0].role)) throw new HttpError(403, 'You do not have access to this');
  return rows[0];
}
