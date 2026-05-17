/**
 * Typed wrapper around Plausible's custom-event API.
 *
 * Plausible's current script format ships a per-site loader URL
 * (`https://plausible.io/js/pa-<hash>.js`) that already encodes the
 * site identity — there is no `data-domain` attribute on the new
 * stack. We follow Plausible's recommended bootstrap exactly: install
 * a queue stub on `window.plausible` first (so events fired before
 * the script loads are buffered), inject the loader, then call
 * `plausible.init()` to flush.
 *
 * Bootstrap is a no-op when `VITE_PLAUSIBLE_SCRIPT_ID` is unset (local
 * dev, preview deploys, any environment without the env var) — the
 * stub never gets installed and `track()` becomes a silent no-op
 * because `window.plausible` stays undefined. Call-sites don't need
 * to guard.
 *
 * The goal list is closed on purpose: callers get autocomplete and
 * can't typo a name into a brand-new low-volume goal. Add an entry
 * here, then configure the matching custom event in the Plausible
 * dashboard (Site settings → Goals & funnels → +) so it shows up in
 * the conversion view. See `docs/PLAUSIBLE_SETUP.md` for the list.
 */

export type PlausibleGoal =
  | 'SignedIn' // user just completed a sign-in (magic link or OAuth)
  | 'ItemAdded' // user successfully created a wishlist item
  | 'GroupCreated'; // user successfully created a friend circle

type PlausibleProps = Record<string, string | number | boolean>;

interface PlausibleApi {
  (event: PlausibleGoal, options?: { props?: PlausibleProps }): void;
  /** Queue of calls made before the real script loaded. */
  q?: unknown[][];
  /** Init options captured by the stub; the real loader reads this. */
  o?: unknown;
  /** Init hook — Plausible's loader replaces it with the real impl. */
  init?: (options?: unknown) => void;
}

declare global {
  interface Window {
    plausible?: PlausibleApi;
  }
}

/**
 * Install the Plausible queue stub and inject the per-site loader
 * script. Safe to call once on client startup; no-op on the server.
 *
 * The `scriptId` is the unique identifier Plausible hands out in the
 * "Install Plausible" step of site setup (e.g. `pa-shRef6EUUr7…`).
 * Not a secret — it ships in the client bundle and in every network
 * request to plausible.io — but we read it from env to keep the value
 * out of source control and to gate the script on env presence.
 */
export function initPlausible(scriptId: string): void {
  if (typeof window === 'undefined') return;
  if (window.plausible) return; // already initialised

  const stub: PlausibleApi = function (this: unknown, ...args: unknown[]) {
    (stub.q = stub.q ?? []).push(args);
  };
  stub.init = function (options?: unknown) {
    stub.o = options ?? {};
  };
  window.plausible = stub;

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://plausible.io/js/${scriptId}.js`;
  document.head.appendChild(s);

  stub.init();
}

export function track(event: PlausibleGoal, props?: PlausibleProps): void {
  if (typeof window === 'undefined') return;
  const p = window.plausible;
  if (typeof p !== 'function') return;
  p(event, props ? { props } : undefined);
}
