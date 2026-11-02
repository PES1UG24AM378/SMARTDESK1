// Error type and the wrapper every API route uses.
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const json = (status, body) => Response.json(body, { status });

// Human-readable messages for database rule violations (PostgreSQL error codes).
function mapDbError(err) {
  switch (err.code) {
    case '23514': return json(400, { error: 'Rejected by a database rule', rule: err.constraint });
    case '23503': return json(409, { error: 'Related record conflict', rule: err.constraint });
    case '23505': return json(409, { error: 'Already exists', rule: err.constraint });
    case '22P02': return json(400, { error: 'Invalid value format' });
    case 'P0001': return json(409, { error: err.message });   // RAISE EXCEPTION from procedures
    default: return null;
  }
}

// Basic CSRF defence: a state-changing request from another origin is refused.
function checkOrigin(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host && new URL(origin).host !== host) throw new HttpError(403, 'Cross-origin request refused');
}

export function withErrors(handler) {
  return async (request, ctx) => {
    try {
      checkOrigin(request);
      return await handler(request, ctx);
    } catch (err) {
      // Next.js uses thrown errors internally (dynamic rendering, redirects); they must pass through.
      if (typeof err?.digest === 'string' && /^(DYNAMIC_SERVER_USAGE|NEXT_)/.test(err.digest)) throw err;
      if (err instanceof HttpError) return json(err.status, { error: err.message, ...err.extra });
      if (err?.name === 'ZodError') {
        return json(400, { error: 'Invalid input', issues: err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`) });
      }
      const mapped = err?.code ? mapDbError(err) : null;
      if (mapped) return mapped;
      console.error('Unhandled API error:', err);
      return json(500, { error: 'Something went wrong. Please try again.' });
    }
  };
}
