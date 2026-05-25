/**
 * Stash + read the "where to land after sign-in" path across the OAuth
 * round-trip. Lives in its own module so `AuthProvider.tsx` stays a
 * pure-components file (the `react-refresh/only-export-components`
 * lint rule needs that for Fast Refresh).
 *
 * Why sessionStorage instead of URL query params: Supabase's URI
 * allow-list for OAuth redirects strips query strings off any URL that
 * doesn't already match a whitelisted shape with the params. For
 * ratlist.app the whitelist is the bare `https://ratlist.app/auth/callback`,
 * so passing `?next=...` in `redirectTo` doesn't survive — confirmed in
 * prod 2026-05-25 when a real new-user Google signup from /event/<token>
 * landed on / instead of the event.
 *
 * sessionStorage survives the OAuth navigation reliably because the
 * Google flow stays in the same tab (it's a top-level location change,
 * not a window.open). It's cleared on tab close, so a stale `next` from
 * yesterday's session never hijacks today's sign-in.
 *
 * Magic-link caveat: if the user requests a magic link, closes the
 * tab, and clicks the email on a different device or after a browser
 * restart, sessionStorage is empty and they land on / instead of the
 * deep-link target. Acceptable degradation — magic link cross-device
 * is a rare path and `/` is still a valid destination.
 */

/** sessionStorage key. Single shared name — no per-session prefixing
 *  needed since same-origin tabs each get their own sessionStorage. */
const NEXT_PATH_KEY = 'auth_next_path';

/**
 * Same-origin path validator. Used at both write- and read-sites so the
 * open-redirect guard sits on every read. A protocol-relative URL like
 * `//evil.com/phish` would let an attacker phish if it slipped through;
 * the second `!startsWith('//')` check blocks that.
 */
function isSafeNextPath(raw: string | null | undefined): raw is string {
  return !!raw && raw.startsWith('/') && !raw.startsWith('//');
}

/**
 * Store `nextPath` for the round-trip. No-op for null / unsafe values
 * — and any existing stored value is cleared, so a previous abandoned
 * sign-in attempt can't re-fire its redirect.
 */
export function rememberNextPath(nextPath?: string | null): void {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') return;
  if (isSafeNextPath(nextPath)) {
    window.sessionStorage.setItem(NEXT_PATH_KEY, nextPath);
  } else {
    window.sessionStorage.removeItem(NEXT_PATH_KEY);
  }
}

/**
 * Read AND clear the stored next path. Single-use semantics — if the
 * user refreshes /auth/callback, the redirect doesn't re-fire (they'd
 * just sit on the callback screen, which is fine since there's nothing
 * left to do).
 *
 * Returns null when storage is empty or the stored value fails the
 * same-origin guard.
 */
export function consumeNextPath(): string | null {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') return null;
  const raw = window.sessionStorage.getItem(NEXT_PATH_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(NEXT_PATH_KEY);
  return isSafeNextPath(raw) ? raw : null;
}
