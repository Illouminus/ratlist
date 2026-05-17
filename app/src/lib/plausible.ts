/**
 * Typed wrapper around Plausible's custom-event API.
 *
 * The Plausible script is injected from `main.tsx` only when
 * `VITE_PLAUSIBLE_DOMAIN` is set. When it isn't (local dev, preview
 * deploys, any environment without the env var) `window.plausible`
 * stays undefined and `track()` becomes a silent no-op — no error,
 * no console noise. That means call-sites don't need to guard.
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
}

declare global {
  interface Window {
    plausible?: PlausibleApi;
  }
}

export function track(event: PlausibleGoal, props?: PlausibleProps): void {
  if (typeof window === 'undefined') return;
  const p = window.plausible;
  if (typeof p !== 'function') return;
  p(event, props ? { props } : undefined);
}
