/**
 * `/api/share/[token]` — Vercel Edge Function that serves the
 * `/share/<token>` URL with route-specific Open Graph meta tags so
 * social-network crawlers see a personalised preview instead of the
 * site-wide landing card.
 *
 * Why a function and not a prerendered file: share tokens are minted
 * at runtime when a user toggles sharing on, so prerendering them at
 * build time is impossible. SSR was the alternative — too much
 * machinery for one page. This function is the smallest thing that
 * does the job: it fetches the already-built `_spa.html`, patches
 * the `<head>` with per-token tags, and returns the result. Users
 * land on the same React SPA bundle they would have anyway, just
 * with a richer head.
 *
 * Lookup path:
 *   1. `get_public_list(_token)` over PostgREST with the anon key
 *      (function is SECURITY DEFINER, granted to anon)
 *   2. On success, build a per-share `<title>` / description /
 *      og:image (`/og.png?token=...`, which is rendered by the
 *      `og-image` Supabase Edge Function).
 *   3. Any failure (bad token, network blip, missing env) → fall
 *      back to the un-patched template. Crawlers see the default
 *      landing preview, the SPA still works.
 *
 * Caching: clients keep the response for a minute, the CDN for an
 * hour. Per-token URLs are different cache keys, so rotating one
 * user's share token doesn't poison anyone else's preview. The
 * upstream `_spa.html` only changes on deploy; the patching is
 * fast (<5 ms) so there's no benefit to caching the un-patched
 * template separately.
 *
 * Vercel routes this via the `/share/:token → /api/share/:token`
 * rewrite in `vercel.json`. The function file name uses Next.js-
 * style `[token]` so Vercel can extract the URL segment from the
 * rewritten path.
 */

export const config = {
  runtime: 'edge',
};

interface ShareSummary {
  displayName: string;
  itemCount: number;
}

async function fetchShareSummary(token: string): Promise<ShareSummary | null> {
  // Vercel passes plain env vars through to Edge runtime via process.env.
  // We accept either `SUPABASE_URL`/`SUPABASE_ANON_KEY` (server-only names)
  // or the `VITE_` prefixes that already exist in the project's Vercel env
  // so adding the function doesn't require duplicating credentials.
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/get_public_list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ _token: token }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as
      | { owner?: { display_name?: string } | null; items?: unknown[] | null }
      | Array<{ owner?: { display_name?: string } | null; items?: unknown[] | null }>
      | null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.owner) return null;
    return {
      displayName: row.owner.display_name ?? 'a friend',
      itemCount: Array.isArray(row.items) ? row.items.length : 0,
    };
  } catch {
    return null;
  }
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface PatchedMeta {
  title: string;
  description: string;
  ogImage: string;
  canonical: string;
}

/**
 * Rewrite the head tags that crawlers actually read. Idempotent — if
 * the template already has the meta, we replace it in place; if not,
 * we inject just before `</head>`. The set of tags here mirrors the
 * ones in `index.html` so a future template rework only needs to
 * keep the same names for the regex to match.
 */
function patchHead(html: string, meta: PatchedMeta): string {
  const tagsToReplace: Array<[RegExp, string]> = [
    [
      /<title>[\s\S]*?<\/title>/,
      `<title>${escapeAttr(meta.title)}</title>`,
    ],
    [
      /<meta\s+property="og:title"[^>]*>/,
      `<meta property="og:title" content="${escapeAttr(meta.title)}">`,
    ],
    [
      /<meta\s+property="og:description"[\s\S]*?>/,
      `<meta property="og:description" content="${escapeAttr(meta.description)}">`,
    ],
    [
      /<meta\s+property="og:url"[^>]*>/,
      `<meta property="og:url" content="${escapeAttr(meta.canonical)}">`,
    ],
    [
      /<meta\s+property="og:image"[^>]*>/,
      `<meta property="og:image" content="${escapeAttr(meta.ogImage)}">`,
    ],
    [
      /<meta\s+name="twitter:title"[^>]*>/,
      `<meta name="twitter:title" content="${escapeAttr(meta.title)}">`,
    ],
    [
      /<meta\s+name="twitter:description"[\s\S]*?>/,
      `<meta name="twitter:description" content="${escapeAttr(meta.description)}">`,
    ],
    [
      /<meta\s+name="twitter:image"[^>]*>/,
      `<meta name="twitter:image" content="${escapeAttr(meta.ogImage)}">`,
    ],
  ];

  let out = html;
  for (const [re, replacement] of tagsToReplace) {
    out = out.replace(re, replacement);
  }

  // Canonical + description: the un-prerendered `_spa.html` doesn't
  // ship these (they're per-route, written by `prerender.tsx` only
  // for the routes that get prerendered). Inject them.
  const extras: string[] = [];
  if (!/rel="canonical"/.test(out)) {
    extras.push(`<link rel="canonical" href="${escapeAttr(meta.canonical)}">`);
  }
  if (!/name="description"/.test(out)) {
    extras.push(`<meta name="description" content="${escapeAttr(meta.description)}">`);
  }
  if (extras.length > 0) {
    out = out.replace('</head>', `${extras.join('\n')}\n</head>`);
  }

  return out;
}

/**
 * Extract the share token from the request URL.
 *
 * Vercel rewrites `/share/:token` to `/api/share/:token`. By the time
 * our handler runs, the final segment of the pathname is the token.
 * Empty segments and trailing slashes are treated as "no token".
 */
function extractToken(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  return last && last !== 'share' ? decodeURIComponent(last) : null;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('method_not_allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const token = extractToken(url);
  if (!token) {
    return new Response('not_found', { status: 404 });
  }

  // Fetch the SPA shell from the same deployment.
  // `_spa.html` is the un-prerendered template that Vercel rewrites
  // every unknown SPA route to anyway, so we know it exists and the
  // CDN has it warm.
  let template: string;
  try {
    const tpl = await fetch(new URL('/_spa.html', url.origin));
    if (!tpl.ok) {
      // Degraded path: if the SPA shell isn't available for some
      // reason, send the user to the home page rather than 500.
      return Response.redirect(new URL('/', url.origin), 302);
    }
    template = await tpl.text();
  } catch {
    return Response.redirect(new URL('/', url.origin), 302);
  }

  // Best-effort owner / count lookup. Token may be invalid, the DB
  // may be unreachable — we don't gate the page on the lookup, just
  // skip the personalisation step. The SPA itself handles invalid
  // tokens on the client with a "this link no longer works" view.
  const summary = await fetchShareSummary(token);

  const origin = 'https://ratlist.app';
  const canonical = `${origin}/share/${encodeURIComponent(token)}`;
  const ogImage = `${origin}/og.png?token=${encodeURIComponent(token)}`;
  const title = summary
    ? `${summary.displayName}'s wishlist — Rat List`
    : 'A shared wishlist — Rat List';
  const itemsLine = summary
    ? summary.itemCount === 1
      ? '1 item'
      : `${summary.itemCount} items`
    : '';
  const description = summary
    ? `${summary.displayName} shared ${itemsLine} on Rat List. View without an account — no sign-up needed.`
    : 'A shared wishlist on Rat List. View without an account — no sign-up needed.';

  const patched = patchHead(template, {
    title,
    description,
    ogImage,
    canonical,
  });

  return new Response(patched, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Clients keep for a minute (in case the user reloads),
      // the CDN keeps for an hour. Different ?token= values are
      // distinct cache keys, so one user's token rotation can't
      // poison another's preview.
      'cache-control': 'public, max-age=60, s-maxage=3600',
    },
  });
}
