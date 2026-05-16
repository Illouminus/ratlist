/**
 * `fetch-url-meta` — given a product URL, fetch the page server-side
 * and extract the bits the Add Item drawer cares about:
 *
 *   - title       og:title → twitter:title → <title>
 *   - image_url   og:image → twitter:image (absolutised against the URL)
 *   - site_name   og:site_name (used as the "maker" hint)
 *   - price_text  og:price:amount[+ currency] OR schema.org/Product price
 *   - description og:description → twitter:description (truncated)
 *
 * Why an Edge Function and not the client: many product sites set
 * `X-Frame-Options` / restrictive CORS and refuse to be fetched from a
 * browser. Doing it server-side from Deno also lets us set a sane
 * User-Agent and time-budget, and keeps secrets like rate-limit tokens
 * out of the client.
 *
 * Request:  POST { url: string }
 * Response: { title?, image_url?, site_name?, price_text?, description? }
 *           or { error: string } with status 4xx/5xx
 */
import { preflight, jsonResponse } from '../_shared/cors.ts';

interface RequestBody {
  url?: unknown;
}

interface UrlMetadata {
  title?: string;
  image_url?: string;
  site_name?: string;
  price_text?: string;
  description?: string;
}

const FETCH_TIMEOUT_MS = 8000;
// Browsers usually get richer pages than headless clients. Identify as a
// modern Chrome so most sites serve the same HTML they'd serve a user.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36 ' +
  '(compatible; krysa-link-preview/1.0)';

// Patterns we look up. All are matched case-insensitively against the
// raw HTML — we deliberately don't run a full DOM parse here. The og:
// convention is well-defined and forgiving sites tolerate occasional
// misses; a DOM parser would add hundreds of kb to the function bundle
// for marginal gains on the long tail.
function pickMeta(html: string, properties: string[]): string | undefined {
  for (const prop of properties) {
    // property="og:image"  content="..."  (either attribute order)
    const re1 = new RegExp(
      `<meta\\s+[^>]*property=["']${escapeRe(prop)}["'][^>]*content=["']([^"']+)["']`,
      'i',
    );
    const re2 = new RegExp(
      `<meta\\s+[^>]*content=["']([^"']+)["'][^>]*property=["']${escapeRe(prop)}["']`,
      'i',
    );
    // name= variant for twitter cards
    const re3 = new RegExp(
      `<meta\\s+[^>]*name=["']${escapeRe(prop)}["'][^>]*content=["']([^"']+)["']`,
      'i',
    );
    const re4 = new RegExp(
      `<meta\\s+[^>]*content=["']([^"']+)["'][^>]*name=["']${escapeRe(prop)}["']`,
      'i',
    );
    for (const re of [re1, re2, re3, re4]) {
      const match = html.match(re);
      if (match && match[1]) return decodeHtmlEntities(match[1]);
    }
  }
  return undefined;
}

function pickTitleFallback(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (match && match[1]) return decodeHtmlEntities(match[1].trim());
  return undefined;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;/gi, (entity) => ENTITY_MAP[entity.toLowerCase()] ?? entity);
}

function absolutise(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

/** Combines og:price:amount and og:price:currency into a single string. */
function formatPrice(amount?: string, currency?: string): string | undefined {
  if (!amount) return undefined;
  const trimmed = amount.trim();
  if (trimmed.length === 0) return undefined;
  // If the amount already contains a currency symbol, don't double-prefix.
  if (/[€$£¥₽]/.test(trimmed)) return trimmed;
  const symbol = currency
    ? ({ EUR: '€', USD: '$', GBP: '£', JPY: '¥', RUB: '₽' } as Record<string, string>)[
        currency.toUpperCase()
      ] ?? currency
    : '';
  return symbol ? `${symbol}${trimmed}` : trimmed;
}

/**
 * Truncate to a sensible length so a long meta description doesn't blow
 * out the Add Item drawer's note field. 280 ≈ a tweet.
 */
function truncate(s: string | undefined, max = 280): string | undefined {
  if (!s) return undefined;
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

async function parseMetadata(url: string): Promise<UrlMetadata> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }
    // Cap the body so a 50 MB page can't OOM the function.
    const text = await response.text();
    html = text.slice(0, 2_000_000);
  } finally {
    clearTimeout(timeout);
  }

  const title =
    pickMeta(html, ['og:title', 'twitter:title']) ?? pickTitleFallback(html);
  const rawImage = pickMeta(html, ['og:image', 'og:image:url', 'twitter:image']);
  const siteName = pickMeta(html, ['og:site_name']);
  const description = pickMeta(html, ['og:description', 'twitter:description']);

  const priceAmount = pickMeta(html, ['og:price:amount', 'product:price:amount']);
  const priceCurrency = pickMeta(html, [
    'og:price:currency',
    'product:price:currency',
  ]);

  const result: UrlMetadata = {};
  if (title) result.title = title.trim();
  if (rawImage) result.image_url = absolutise(rawImage.trim(), url);
  if (siteName) result.site_name = siteName.trim();
  const price = formatPrice(priceAmount, priceCurrency);
  if (price) result.price_text = price;
  const desc = truncate(description?.trim());
  if (desc) result.description = desc;
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  if (typeof body.url !== 'string' || body.url.trim().length === 0) {
    return jsonResponse({ error: 'url_required' }, 400);
  }

  let target: URL;
  try {
    target = new URL(body.url.trim());
  } catch {
    return jsonResponse({ error: 'invalid_url' }, 400);
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return jsonResponse({ error: 'unsupported_protocol' }, 400);
  }

  try {
    const metadata = await parseMetadata(target.toString());
    return jsonResponse(metadata, 200);
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'timeout'
        : err instanceof Error
          ? err.message
          : 'unknown_error';
    return jsonResponse({ error: 'fetch_failed', detail: message }, 502);
  }
});
