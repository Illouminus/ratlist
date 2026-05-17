/**
 * `fetch-url-meta` — given a product URL, fetch the page server-side
 * and extract the bits the Add Item drawer cares about:
 *
 *   - title       og:title → twitter:title → JSON-LD Product.name →
 *                  Amazon productTitle → <title>
 *   - image_url   og:image → twitter:image → JSON-LD Product.image →
 *                  Amazon data-old-hires / data-a-dynamic-image
 *                  (absolutised against the page URL)
 *   - site_name   og:site_name → JSON-LD brand.name → URL host
 *   - price_text  og:price:amount[+currency] →
 *                  JSON-LD Product.offers.price[+priceCurrency]
 *   - description og:description → twitter:description →
 *                  JSON-LD Product.description → <meta name="description">
 *
 * Why an Edge Function and not the client: many product sites set
 * X-Frame-Options / restrictive CORS and refuse to be fetched from a
 * browser. Server-side fetch with a real User-Agent solves that.
 *
 * Why layered extractors: og:/twitter: covers most well-behaved sites,
 * JSON-LD covers any site that wants Google rich results, and a few
 * site-specific shortcuts cover the awkward giants (Amazon serves none
 * of the above). First non-empty value per field wins.
 *
 * Request:  POST { url: string }
 * Response: { title?, image_url?, site_name?, price_text?, description? }
 *           or { error: string } with status 4xx/5xx.
 */
import { bindCors } from '../_shared/cors.ts';
import { isBlockedHost } from './blocklist.ts';

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
/** Identify as a modern Chrome so most sites serve the same HTML they'd
 *  serve a real user. Some sites (Amazon!) still strip price out, but
 *  this works on the long tail. */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36 ' +
  '(compatible; krysa-link-preview/1.0)';

// ─────────────────────────── util ───────────────────────────

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

function truncate(s: string, max = 280): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

/** Merge two metadata results — `a` wins per field. */
function mergePrefer(a: UrlMetadata, b: UrlMetadata): UrlMetadata {
  return {
    title: a.title || b.title,
    image_url: a.image_url || b.image_url,
    site_name: a.site_name || b.site_name,
    price_text: a.price_text || b.price_text,
    description: a.description || b.description,
  };
}

// ─────────────────────────── og / twitter ───────────────────────────

function pickMetaContent(html: string, properties: string[]): string | undefined {
  for (const prop of properties) {
    const propRe = escapeRe(prop);
    // 4 variants: property/name × content-first/last attribute order.
    const patterns = [
      new RegExp(`<meta\\s+[^>]*property=["']${propRe}["'][^>]*content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*property=["']${propRe}["']`, 'i'),
      new RegExp(`<meta\\s+[^>]*name=["']${propRe}["'][^>]*content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*name=["']${propRe}["']`, 'i'),
    ];
    for (const re of patterns) {
      const match = html.match(re);
      if (match && match[1]) return decodeHtmlEntities(match[1]);
    }
  }
  return undefined;
}

function formatPrice(amount: string | undefined, currency: string | undefined): string | undefined {
  if (!amount) return undefined;
  const trimmed = amount.trim();
  if (trimmed.length === 0) return undefined;
  if (/[€$£¥₽]/.test(trimmed)) return trimmed;
  const symbol = currency
    ? ({ EUR: '€', USD: '$', GBP: '£', JPY: '¥', RUB: '₽' } as Record<string, string>)[
        currency.toUpperCase()
      ] ?? currency
    : '';
  return symbol ? `${symbol}${trimmed}` : trimmed;
}

function extractOpenGraph(html: string): UrlMetadata {
  const title = pickMetaContent(html, ['og:title', 'twitter:title']);
  const image = pickMetaContent(html, ['og:image', 'og:image:url', 'twitter:image']);
  const siteName = pickMetaContent(html, ['og:site_name']);
  const description = pickMetaContent(html, ['og:description', 'twitter:description']);
  const priceAmount = pickMetaContent(html, ['og:price:amount', 'product:price:amount']);
  const priceCurrency = pickMetaContent(html, ['og:price:currency', 'product:price:currency']);

  return {
    title: title?.trim(),
    image_url: image?.trim(),
    site_name: siteName?.trim(),
    description: description ? truncate(description.trim()) : undefined,
    price_text: formatPrice(priceAmount, priceCurrency),
  };
}

// ─────────────────────────── JSON-LD ───────────────────────────

/** Find every `<script type="application/ld+json">` block and parse it
 *  as JSON, expanding `@graph` wrappers into their items. Malformed
 *  blocks are silently skipped. */
function extractJsonLdNodes(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re =
    /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && typeof item === 'object' && '@graph' in item) {
          const graph = (item as Record<string, unknown>)['@graph'];
          if (Array.isArray(graph)) {
            blocks.push(...graph);
            continue;
          }
        }
        blocks.push(item);
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return blocks;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asProductImage(v: unknown): string | undefined {
  // image can be a string, an array of strings, or an ImageObject
  // ({ url, contentUrl }) — handle each.
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    for (const item of v) {
      const s = asProductImage(item);
      if (s) return s;
    }
    return undefined;
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return asString(o.url) ?? asString(o.contentUrl);
  }
  return undefined;
}

function isProduct(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== 'object') return false;
  const t = (node as Record<string, unknown>)['@type'];
  if (t === 'Product') return true;
  if (Array.isArray(t) && t.includes('Product')) return true;
  return false;
}

function extractJsonLdProduct(html: string): UrlMetadata {
  const nodes = extractJsonLdNodes(html);
  const product = nodes.find(isProduct);
  if (!product) return {};

  // offers can be an Offer, an AggregateOffer, or an array
  const offersRaw = product.offers;
  const offer = Array.isArray(offersRaw) ? offersRaw[0] : offersRaw;
  let priceAmount: string | undefined;
  let priceCurrency: string | undefined;
  if (offer && typeof offer === 'object') {
    const o = offer as Record<string, unknown>;
    priceAmount =
      asString(o.price) ??
      asString(o.lowPrice) ??
      (typeof o.price === 'number' ? String(o.price) : undefined);
    priceCurrency = asString(o.priceCurrency);
  }

  // brand can be a string or an Organization { name }
  const brandRaw = product.brand;
  let brand: string | undefined;
  if (typeof brandRaw === 'string') brand = brandRaw;
  else if (brandRaw && typeof brandRaw === 'object') {
    brand = asString((brandRaw as Record<string, unknown>).name);
  }

  return {
    title: asString(product.name)?.trim(),
    image_url: asProductImage(product.image),
    site_name: brand?.trim(),
    description: asString(product.description)
      ? truncate(asString(product.description)!.trim())
      : undefined,
    price_text: formatPrice(priceAmount, priceCurrency),
  };
}

// ─────────────────────────── Amazon ───────────────────────────

/** Amazon's image map is HTML-escaped JSON inside `data-a-dynamic-image`,
 *  mapping URLs to `[width, height]` tuples. We pick the highest-area URL. */
function extractAmazonDynamicImage(html: string): string | undefined {
  const match = html.match(/data-a-dynamic-image=["']([^"']+)["']/i);
  if (!match || !match[1]) return undefined;
  try {
    const obj = JSON.parse(decodeHtmlEntities(match[1])) as Record<string, [number, number]>;
    let best: { url: string; area: number } | undefined;
    for (const [url, dims] of Object.entries(obj)) {
      if (!Array.isArray(dims) || dims.length < 2) continue;
      const [w, h] = dims;
      const area = (w ?? 0) * (h ?? 0);
      if (!best || area > best.area) best = { url, area };
    }
    return best?.url;
  } catch {
    return undefined;
  }
}

function extractAmazon(html: string): UrlMetadata {
  // title — productTitle span has surrounding whitespace
  const titleMatch = html.match(/<span\s+[^>]*id=["']productTitle["'][^>]*>([^<]+)<\/span>/i);
  const title = titleMatch?.[1]?.trim();

  // image — old-hires is a single high-res URL; falls back to the dynamic map
  const oldHires = html.match(/data-old-hires=["']([^"']+)["']/i)?.[1];
  const image = oldHires ?? extractAmazonDynamicImage(html);

  return { title, image_url: image };
}

// ─────────────────────────── fallbacks ───────────────────────────

function extractFallbacks(html: string, baseUrl: string): UrlMetadata {
  const out: UrlMetadata = {};

  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleTag && titleTag[1]) out.title = decodeHtmlEntities(titleTag[1].trim());

  const desc = pickMetaContent(html, ['description']);
  if (desc) out.description = truncate(desc.trim());

  try {
    out.site_name = new URL(baseUrl).host.replace(/^www\./, '');
  } catch {
    // ignore
  }

  return out;
}

// ─────────────────────────── pipeline ───────────────────────────

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
        // Amazon and a few others serve different markup without these.
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    // Cap the body so a runaway 50 MB page can't OOM the function.
    html = (await response.text()).slice(0, 2_500_000);
  } finally {
    clearTimeout(timeout);
  }

  // Run each extractor; first non-empty value per field wins. Order is
  // by reliability when present:
  //   og: → JSON-LD Product → Amazon-specific → fallbacks
  let result: UrlMetadata = {};
  result = mergePrefer(result, extractOpenGraph(html));
  result = mergePrefer(result, extractJsonLdProduct(html));
  result = mergePrefer(result, extractAmazon(html));
  result = mergePrefer(result, extractFallbacks(html, url));

  // Absolutise image URLs in case any extractor returned a relative one.
  if (result.image_url) {
    result.image_url = absolutise(result.image_url, url);
  }
  return result;
}

// ─────────────────────────── handler ───────────────────────────

Deno.serve(async (req) => {
  const cors = bindCors(req);
  if (req.method === 'OPTIONS') return cors.preflight();
  if (req.method !== 'POST') {
    return cors.json({ error: 'method_not_allowed' }, 405);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return cors.json({ error: 'invalid_json' }, 400);
  }

  if (typeof body.url !== 'string' || body.url.trim().length === 0) {
    return cors.json({ error: 'url_required' }, 400);
  }

  let target: URL;
  try {
    target = new URL(body.url.trim());
  } catch {
    return cors.json({ error: 'invalid_url' }, 400);
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return cors.json({ error: 'unsupported_protocol' }, 400);
  }
  // Refuse known-NSFW hosts upfront — we don't want their og:image
  // ending up on someone's public wishlist or Secret Santa preview.
  // See `blocklist.ts` for the policy. 422 (not 400) signals "we
  // understood your request, the policy refuses it" — distinct from
  // a malformed URL so the client can show a different message.
  if (isBlockedHost(target.hostname)) {
    return cors.json({ error: 'blocked_host' }, 422);
  }

  try {
    const metadata = await parseMetadata(target.toString());
    return cors.json(metadata, 200);
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'timeout'
        : err instanceof Error
          ? err.message
          : 'unknown_error';
    return cors.json({ error: 'fetch_failed', detail: message }, 502);
  }
});
