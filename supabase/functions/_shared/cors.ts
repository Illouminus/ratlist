/**
 * CORS for our Edge Functions.
 *
 * A single hard-coded `Access-Control-Allow-Origin` can't cover the
 * three places this app legitimately calls our functions from:
 *
 *   - production: https://ratlist.app
 *   - Vercel preview deploys: https://<slug>-<project>.vercel.app
 *   - local dev: http://localhost:5173
 *
 * So the function decides per-request: read the incoming `Origin` header,
 * check it against the allow-list (and the *.vercel.app pattern), and
 * echo it back. Unknown origins get our production URL — enough for the
 * browser to still see a valid CORS response, but with the "wrong"
 * origin so the same-origin policy blocks reading the body.
 */

/** Hard-coded exact-match allow-list. */
const EXACT_ALLOWED_ORIGINS = new Set<string>([
  'https://ratlist.app',
  'http://localhost:5173',
]);

/** Fallback origin advertised when the incoming Origin isn't recognised. */
const FALLBACK_ORIGIN = 'https://ratlist.app';

function isVercelPreview(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

function resolveOrigin(req: Request): string {
  const origin = req.headers.get('Origin');
  if (!origin) return FALLBACK_ORIGIN;
  if (EXACT_ALLOWED_ORIGINS.has(origin)) return origin;
  if (isVercelPreview(origin)) return origin;
  return FALLBACK_ORIGIN;
}

function headersFor(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Tell caches that the response varies by Origin — otherwise a
    // cached response for ratlist.app could be served back to a
    // localhost request with the wrong header set.
    Vary: 'Origin',
  };
}

/**
 * Bind CORS helpers to a single request. Pattern at the top of every
 * function:
 *
 *   Deno.serve((req) => {
 *     const cors = bindCors(req);
 *     if (req.method === 'OPTIONS') return cors.preflight();
 *     // ...
 *     return cors.json({ ok: true });
 *   });
 */
export function bindCors(req: Request) {
  const baseHeaders = headersFor(req);
  return {
    preflight(): Response {
      return new Response('ok', { headers: baseHeaders });
    },
    json<T>(body: T, status = 200): Response {
      return new Response(JSON.stringify(body), {
        status,
        headers: { ...baseHeaders, 'content-type': 'application/json' },
      });
    },
  };
}
