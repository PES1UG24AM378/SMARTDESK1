// Small in-memory rate limiter (fine for a single server instance).
const store = () => (globalThis._sdRate ??= new Map());

export function isBlocked(key, limit = 5, windowMs = 15 * 60 * 1000) {
  const e = store().get(key);
  if (!e) return 0;
  if (Date.now() > e.resetAt) { store().delete(key); return 0; }
  return e.count >= limit ? Math.ceil((e.resetAt - Date.now()) / 1000) : 0;   // seconds left
}

export function recordFailure(key, windowMs = 15 * 60 * 1000) {
  const e = store().get(key);
  if (!e || Date.now() > e.resetAt) store().set(key, { count: 1, resetAt: Date.now() + windowMs });
  else e.count += 1;
}

export const clearFailures = (key) => store().delete(key);
