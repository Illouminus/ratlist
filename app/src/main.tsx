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
import './styles/global.css';

// Plausible analytics — privacy-respecting, no cookies, no personal
// data. Gated on env var so local / unconfigured deploys stay silent.
// The script is loaded async + deferred so it doesn't block paint.
const plausibleDomain = import.meta.env.VITE_PLAUSIBLE_DOMAIN;
if (plausibleDomain) {
  const s = document.createElement('script');
  s.defer = true;
  s.dataset.domain = plausibleDomain;
  s.src = 'https://plausible.io/js/script.js';
  document.head.appendChild(s);
}

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

// In production the container has prerendered HTML (see `prerender.tsx`)
// so we hydrate. In dev there's nothing prerendered — `index.html` ships
// an empty `<div id="root">` — so falling back to `createRoot` avoids the
// "no hydration mismatches found because the server rendered an empty
// container" warning and the behaviour change React 19 made around it.
if (container.hasChildNodes()) {
  hydrateRoot(container, tree);
} else {
  createRoot(container).render(tree);
}
