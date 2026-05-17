/**
 * `og-image` — server-rendered Open Graph preview PNG (1200x630)
 * referenced by `<meta property="og:image">` and `twitter:image` in
 * `index.html`. Social-network scrapers (Facebook, Twitter, Telegram,
 * Discord, Slack, iMessage) GET this URL, cache the bytes, and use
 * the result for link previews.
 *
 * Render path:
 *   html template → satori (SVG) → resvg-wasm (PNG bytes)
 *
 * Why this stack: satori is the same library Next.js uses for
 * `@vercel/og`. Here on Supabase Edge (Deno) we wire it up directly.
 *
 * Fonts: Newsreader Italic + Regular shipped as bundled WOFF files
 * (~30 KB each, from @fontsource/newsreader). WOFF1 is the format
 * satori accepts — woff2 is NOT supported, and variable TTFs choke
 * on satori's font-table parser. Loaded once per cold start from the
 * function directory.
 *
 * Caching: the function is public (verify_jwt = false in config.toml)
 * and the response sets a long `s-maxage` so the CDN serves crawlers
 * from cache. Render time is ~400–700 ms cold, ~30 ms warm.
 */

import satori from 'https://esm.sh/satori@0.10.14';
import { Resvg, initWasm } from 'https://esm.sh/@resvg/resvg-wasm@2.6.2';
import { FONT_ITALIC_WOFF_B64, FONT_REGULAR_WOFF_B64 } from './_fonts.ts';

// ─────────────────────────── one-time setup ───────────────────────────

/** resvg-wasm needs `initWasm` called exactly once per worker; a second
 *  call throws. Cache the promise so concurrent first requests share it. */
let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = (async () => {
      const wasmBytes = await (
        await fetch('https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm')
      ).arrayBuffer();
      await initWasm(wasmBytes);
    })();
  }
  return wasmReady;
}

interface LoadedFonts {
  italic: ArrayBuffer;
  regular: ArrayBuffer;
}

/** Decode the inlined base64 fonts on first use. Done lazily so cold
 *  starts that fail before the satori call (e.g. wasm fetch error)
 *  don't pay the decode cost. */
function base64ToBytes(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

let cachedFonts: LoadedFonts | null = null;
function getFonts(): LoadedFonts {
  if (!cachedFonts) {
    cachedFonts = {
      italic: base64ToBytes(FONT_ITALIC_WOFF_B64),
      regular: base64ToBytes(FONT_REGULAR_WOFF_B64),
    };
  }
  return cachedFonts;
}

// ─────────────────────────── palette ───────────────────────────

/** Mirrors the design tokens in app/src/styles/tokens.css so the OG
 *  preview reads as part of the same product. */
const PALETTE = {
  paper: '#fbf6ef',
  ink: '#2b2620',
  inkMid: '#5a5147',
  accent: '#9b4e31',
  hair: 'rgba(43, 38, 32, 0.18)',
} as const;

// ─────────────────────────── markup ───────────────────────────

/**
 * satori accepts JSX trees but also plain React-shape objects. The
 * object form is preferred here because it sidesteps satori-html's
 * whitespace-counting quirk: an HTML string like
 *   `<div> <span/> </div>`
 * parses as 3 children (whitespace, span, whitespace), which trips
 * satori's "container with multiple children needs explicit display"
 * check. Objects only contain what we put in them — no whitespace.
 */

interface SatoriNode {
  type: string;
  props: {
    style?: Record<string, string | number>;
    children?: SatoriNode | string | Array<SatoriNode | string>;
  };
}

function el(
  type: string,
  style: Record<string, string | number>,
  children?: SatoriNode | string | Array<SatoriNode | string>,
): SatoriNode {
  return { type, props: { style, children } };
}

function landingMarkup(): SatoriNode {
  const headlineStyle: Record<string, string | number> = {
    fontStyle: 'italic',
    fontSize: 144,
    lineHeight: 0.95,
    letterSpacing: -3,
  };

  return el(
    'div',
    {
      width: '100%',
      height: '100%',
      background: PALETTE.paper,
      display: 'flex',
      flexDirection: 'column',
      padding: '72px 88px',
      fontFamily: 'Newsreader',
      color: PALETTE.ink,
    },
    [
      // Content column: eyebrow + two big italic lines + lead paragraph.
      el(
        'div',
        {
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          justifyContent: 'center',
        },
        [
          el(
            'div',
            {
              display: 'flex',
              fontSize: 22,
              letterSpacing: 6,
              color: PALETTE.inkMid,
              marginBottom: 32,
              fontStyle: 'normal',
            },
            'RATLIST.APP',
          ),
          el('div', { display: 'flex', ...headlineStyle }, 'wishlist'),
          el(
            'div',
            { display: 'flex', ...headlineStyle, marginTop: -4 },
            'for the rats',
          ),
          el(
            'div',
            {
              display: 'flex',
              fontSize: 30,
              color: PALETTE.inkMid,
              marginTop: 44,
              maxWidth: 880,
              lineHeight: 1.35,
              fontStyle: 'normal',
            },
            'A quiet, ad-free wishlist and Secret Santa for friend circles.',
          ),
        ],
      ),

      // Footer: small terracotta square + uppercase wordmark.
      el(
        'div',
        {
          display: 'flex',
          alignItems: 'center',
          borderTop: `1px solid ${PALETTE.hair}`,
          paddingTop: 28,
        },
        [
          el('div', {
            width: 14,
            height: 14,
            background: PALETTE.accent,
            marginRight: 18,
          }),
          el(
            'div',
            {
              display: 'flex',
              fontSize: 22,
              color: PALETTE.inkMid,
              letterSpacing: 3,
              fontStyle: 'normal',
            },
            'RAT LIST — QUIET WISHLIST',
          ),
        ],
      ),
    ],
  );
}

// ─────────────────────────── handler ───────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response('method_not_allowed', { status: 405 });
  }

  try {
    await ensureWasm();
    const fonts = getFonts();

    const svg = await satori(landingMarkup(), {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Newsreader',
          data: fonts.regular,
          weight: 500,
          style: 'normal',
        },
        {
          name: 'Newsreader',
          data: fonts.italic,
          weight: 500,
          style: 'italic',
        },
      ],
    });

    const png = new Resvg(svg).render().asPng();

    return new Response(png, {
      headers: {
        'content-type': 'image/png',
        // Crawlers re-fetch on their own schedule; immutable hints
        // that the bytes are stable for this URL.
        'cache-control': 'public, max-age=3600, s-maxage=86400, immutable',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return new Response(`og-image error: ${message}`, { status: 500 });
  }
});
