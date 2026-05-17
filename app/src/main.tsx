import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { I18nProvider } from './i18n';
import App from './App';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
