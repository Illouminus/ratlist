/**
 * `AuthCallbackScreen` — landing route for `/auth/callback`, the URL the
 * magic-link email points to. The Supabase client is configured with
 * `detectSessionInUrl: true` and `flowType: 'pkce'`, so it consumes the
 * `code=…` query param automatically and exchanges it for a session.
 *
 * This component just renders a tiny "signing you in…" state until the
 * AuthProvider sees the new session, then redirects.
 */
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { consumeNextPath } from '../auth/nextPathStorage';
import { useI18n } from '../i18n/useI18n';
import { PaperLayout } from '../components/PaperLayout';
import { track } from '../lib/plausible';

export function AuthCallbackScreen() {
  const { t } = useI18n();
  const { status } = useAuth();

  // Read the stored next path ONCE, at the first render where we still
  // have access to sessionStorage. Holding it in useState guarantees
  // the value stays stable across re-renders (status flips from
  // 'loading' → 'authenticated', triggers a re-render; if we re-called
  // consumeNextPath the second time, it'd return null because the
  // first call cleared the storage). We initialise lazily so React
  // calls the reader exactly once per mount.
  const [next] = useState<string>(() => consumeNextPath() ?? '/');

  // Fire the SignedIn goal once per successful callback. This screen
  // is only reachable via a magic-link click or an OAuth redirect, so
  // every transition to `authenticated` here is a genuine sign-in —
  // unlike `onAuthStateChange` in AuthProvider, which also fires for
  // cached-session restores on every page load.
  useEffect(() => {
    if (status === 'authenticated') track('SignedIn');
  }, [status]);

  if (status === 'authenticated') return <Navigate to={next} replace />;
  if (status === 'anonymous') {
    // Either the link was invalid/expired, or Supabase couldn't exchange
    // the code. Send the user back to /login and preserve `next` via the
    // URL — LoginScreen reads it and re-stashes it on the next sign-in
    // attempt.
    const loginTarget = next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`;
    return <Navigate to={loginTarget} replace />;
  }

  return (
    <PaperLayout narrow as="main">
      <p
        className="display-italic"
        style={{ fontSize: 24, color: 'var(--ink-2)', textAlign: 'center', marginTop: 'var(--s-8)' }}
      >
        {t('auth.sending')}
      </p>
    </PaperLayout>
  );
}
