/**
 * Prerender entry. Called by `vite-prerender-plugin` once per route at
 * build time, in Node. Renders the same App tree the browser does but
 * inside a `<StaticRouter>` so the output is a plain HTML string ready
 * to be written to `dist/<route>/index.html`.
 *
 * Anything in here runs in Node, never in the browser. Anything in
 * `main.tsx` runs in the browser, never in Node. The two share `App`
 * and `AppRoutes` (which is why those are router-agnostic).
 *
 * Routes that get prerendered: home and the two legal pages. Everything
 * else stays SPA — authed routes need a real session anyway, and the
 * share-token page is per-list so prerendering it makes no sense
 * (per-token OG image is the separate follow-up).
 *
 * Head tags: this module owns the per-route `<title>` and
 * `<meta name="description">` because those are the SEO-relevant pieces
 * and they need to differ between pages. `index.html` keeps the static
 * defaults (favicon, OG image, Schema.org, Twitter card) — those apply
 * site-wide and don't need to vary per prerendered route yet.
 */
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { I18nProvider } from './i18n';
import App from './App';
import { AppRoutes } from './Router';

interface PrerenderData {
  /** Absolute or relative URL of the route currently being prerendered. */
  url: string;
}

interface RouteMeta {
  title: string;
  description: string;
}

/** Default metadata — used as fallback when a route isn't in `META`. */
const META_DEFAULT: RouteMeta = {
  title: 'Rat List — wishlist for the rats',
  description:
    'A quiet, ad-free wishlist and Secret Santa for friend circles. Share a list by link, hide claims from the gift-receiver, run a draw inside a circle.',
};

/**
 * Per-route SEO metadata. Single source of truth for `<title>` and
 * `<meta name="description">` on the routes we prerender. Add a new
 * entry when you add a new prerendered route, and add the path to
 * `PRERENDER_ROUTES` below so the crawler picks it up.
 */
const META: Record<string, RouteMeta> = {
  '/': META_DEFAULT,
  '/legal/privacy': {
    title: 'Privacy — Rat List',
    description:
      'How Rat List handles your data. GDPR / CNIL framework, French jurisdiction. No tracking, no ads, no data sold to third parties.',
  },
  '/legal/terms': {
    title: 'Terms of Service — Rat List',
    description:
      'Terms of use for Rat List, a wishlist and Secret Santa app for friend circles. Plain-language summary plus the binding legal text.',
  },
};

/** Routes the plugin should prerender. Order is informational only. */
const PRERENDER_ROUTES: ReadonlySet<string> = new Set([
  '/',
  '/legal/privacy',
  '/legal/terms',
]);

export async function prerender(data: PrerenderData) {
  const pathname = new URL(data.url, 'https://ratlist.app').pathname;
  const meta = META[pathname] ?? META_DEFAULT;

  const html = renderToString(
    <I18nProvider>
      <App>
        <StaticRouter location={data.url}>
          <AppRoutes />
        </StaticRouter>
      </App>
    </I18nProvider>,
  );

  return {
    html,
    // Auto-discovered links would also work, but listing them keeps
    // the build deterministic — no surprises if an unrelated <Link>
    // sneaks into the landing.
    links: PRERENDER_ROUTES,
    head: {
      // The app is bilingual via a client-side toggle but the
      // prerendered markup is English. Russian users get the toggle
      // after hydration; for now there's only one canonical URL per
      // page so `lang="en"` matches the static text.
      lang: 'en',
      title: meta.title,
      elements: new Set([
        { type: 'meta', props: { name: 'description', content: meta.description } },
        {
          type: 'link',
          props: { rel: 'canonical', href: `https://ratlist.app${pathname}` },
        },
      ]),
    },
  };
}
