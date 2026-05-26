/**
 * Client entry. Hydrates the prerendered HTML produced at build time by
 * `prerender.tsx`. The two entries share the same provider tree (App)
 * and route definitions (AppRoutes) — only the router implementation
 * differs (`BrowserRouter` here, `StaticRouter` there).
 *
 * Analytics / error reporting init lives in this file (not App.tsx)
 * because both are strictly client-side: Plausible needs a window to
 * inject its script, Sentry's beforeBreadcrumb hook reads URL state.
 * Pulling them out of the SSR-shared App keeps `prerender.tsx` from
 * accidentally booting a tracker during the Node build.
 */
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { I18nProvider } from './i18n';
import App from './App';
import { AppRoutes } from './Router';
import { initPlausible } from './lib/plausible';
import { registerServiceWorker } from './registerSW';
import './styles/global.css';

// Plausible analytics — privacy-respecting, no cookies, no personal
// data. Gated on env var so local / unconfigured deploys stay silent.
// `initPlausible` installs the queue stub + loader script following
// Plausible's per-site bootstrap pattern (the modern stack — the
// loader URL itself encodes the domain, no `data-domain` attribute).
const plausibleScriptId = import.meta.env.VITE_PLAUSIBLE_SCRIPT_ID;
if (plausibleScriptId) initPlausible(plausibleScriptId);

// Sentry — gated on the env var so local / unconfigured deploys stay
// silent. We deliberately disable session replay and tracing for now
// (privacy + bundle size); just plain error reporting until traffic
// justifies more.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Strip query strings from breadcrumb URLs — share tokens or
    // invite tokens could otherwise end up in error reports.
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data && typeof breadcrumb.data.url === 'string') {
        try {
          const u = new URL(breadcrumb.data.url, window.location.origin);
          u.search = '';
          breadcrumb.data.url = u.toString();
        } catch {
          /* leave as-is if not a parseable URL */
        }
      }
      return breadcrumb;
    },
  });
}

const container = document.getElementById('root')!;
const tree = (
  <StrictMode>
    <I18nProvider>
      <App>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </App>
    </I18nProvider>
  </StrictMode>
);

// Only the three prerendered routes ship with content in `<div id="root">`
// at HTTP-response time — see `prerender.tsx` and the PRERENDER_ROUTES
// constant there. Everything else (every authed screen, /share/:token,
// /event/:token, /login, /auth/callback) ships empty-root and renders
// 100% client-side.
//
// We MUST distinguish at mount time: hydrating the wrong tree against
// a prerendered root produces a catastrophic mismatch that, in some
// recovery paths, leaves the old HTML in the DOM and renders the new
// tree underneath it — confirmed in prod 2026-05-25 when a stale
// Service Worker served `index.html` (prerendered LandingScreen) for
// every navigation including `/events`. The PWA fix went out as PR #20
// (workbox `navigateFallback: '/_spa.html'`) but THIS is defence in
// depth: even if some future SW/CDN/proxy serves the wrong HTML for
// a non-prerendered route, the client clears the root and starts fresh.
//
// Hydration stays enabled for the three known-prerendered paths so the
// SEO/critical-render win from prerender.tsx isn't undone.
const PRERENDERED_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/legal/privacy',
  '/legal/terms',
]);

const isPrerenderedPath = PRERENDERED_PATHS.has(window.location.pathname);

if (isPrerenderedPath && container.hasChildNodes()) {
  hydrateRoot(container, tree);
} else {
  // Anything in the root from a wrong-fallback HTML — wipe it before
  // mounting. `replaceChildren()` with no args is the safe DOM API to
  // detach all children (no parsing, no XSS surface, unlike
  // innerHTML='').
  if (container.hasChildNodes()) {
    container.replaceChildren();
  }
  createRoot(container).render(tree);
}

// Register the service worker AFTER React mounts so we don't compete
// for main-thread time during first paint. Replaces
// vite-plugin-pwa's `injectRegister: 'inline'` (which had no .catch()).
// See src/registerSW.ts for the rationale.
void registerServiceWorker();
