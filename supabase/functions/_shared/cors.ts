/**
 * CORS headers used by every Edge Function. We allow our local Vite dev
 * server and let the hosted deploy override the origin via env at
 * runtime (see ALLOWED_ORIGIN secret). For dev simplicity we send `*`
 * when no env is set — fine for the local 127.0.0.1 case, lock down in
 * production once we deploy.
 */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Standard preflight responder. Call at the very top of every function:
 *
 *   if (req.method === 'OPTIONS') return preflight();
 */
export function preflight(): Response {
  return new Response('ok', { headers: corsHeaders });
}

/** JSON response helper that always attaches CORS headers. */
export function jsonResponse<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
