/**
 * Manual service-worker registration with proper error handling.
 *
 * Why we own this instead of letting vite-plugin-pwa inject it:
 * the plugin's `injectRegister: 'inline'` mode emits a bare
 * `navigator.serviceWorker.register('/sw.js')` with no `.catch()`. On
 * mobile networks (flaky Wi-Fi, low-storage Android, restricted
 * browser variants) `register()` can reject — which becomes an
 * unhandled promise rejection, Sentry's global `onunhandledrejection`
 * handler picks it up, and we get a high-priority alert email for
 * what is fundamentally a transient client-side condition we can't
 * fix from our side.
 *
 * This module:
 *   - Bails silently on non-production builds.
 *   - Bails silently if `serviceWorker` isn't in `navigator` (Safari
 *     private mode, ancient browsers, etc.).
 *   - Bails silently if `Notification.permission === 'denied'` —
 *     not necessary functionally but a small optimisation, since SW
 *     install is mostly for push + offline.  (Actually we still want
 *     offline-capable caching for non-push users; skip this.)
 *   - Awaits the registration with try/catch and forwards any error
 *     to Sentry as a `warning` (not `error`) — visible in the
 *     dashboard for trend analysis without firing alert thresholds.
 *
 * Called once from main.tsx after Sentry is initialised. Registration
 * is fire-and-forget; we don't block render on it.
 */
import * as Sentry from '@sentry/react';

export async function registerServiceWorker(): Promise<void> {
  // Dev builds: vite-plugin-pwa's devOptions are disabled and there is
  // no /sw.js on the dev server — calling register() would 404.
  if (import.meta.env.DEV) return;

  if (!('serviceWorker' in navigator)) return;

  try {
    await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      type: 'classic',
    });
  } catch (err) {
    // Convert the unhandled rejection into a tracked warning. Sentry
    // still gets visibility for trend analysis, but the alert level
    // drops below the default high-priority threshold.
    Sentry.captureException(err, {
      level: 'warning',
      tags: { component: 'service-worker', action: 'register' },
    });
  }
}
