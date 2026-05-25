/**
 * `<AuthProvider>` — the only place where Supabase auth state is fetched
 * and subscribed to. Wrap once near the top of the React tree; descendants
 * read state via `useAuth()`.
 *
 * Lifecycle:
 *   1. Mount → load the cached session from storage (instant),
 *   2. Subscribe to `onAuthStateChange` for sign-in / sign-out / refresh,
 *   3. Unmount → unsubscribe.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthError, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';

/**
 * Where Supabase should redirect after the user clicks the magic link
 * (or completes the OAuth round-trip).
 *
 * `nextPath` is a same-origin URL path (`/event/<token>`, `/events`,
 * etc.). When present, we append it as a query param so
 * `AuthCallbackScreen` can read it after the session is established and
 * navigate the user there. Only paths starting with `/` and not `//`
 * are honored — anything else is treated as missing (drops silently to
 * avoid surfacing open-redirect errors to the UI).
 */
function authCallbackUrl(nextPath?: string | null): string {
  const base = `${window.location.origin}/auth/callback`;
  if (!nextPath) return base;
  // Reject protocol-relative URLs (`//evil.com`) and anything not starting
  // with `/`. The remaining shapes — `/foo`, `/foo?bar=1`, `/foo#hash` —
  // are all same-origin.
  if (!nextPath.startsWith('/') || nextPath.startsWith('//')) return base;
  return `${base}?next=${encodeURIComponent(nextPath)}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  // Initial session load + subscription to changes. Runs once.
  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setStatus(data.session ? 'authenticated' : 'anonymous');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setStatus(nextSession ? 'authenticated' : 'anonymous');
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithMagicLink = useCallback(
    async (email: string, nextPath?: string | null): Promise<string | null> => {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: authCallbackUrl(nextPath) },
      });
      return error ? mapAuthError(error) : null;
    },
    [],
  );

  const signInWithGoogle = useCallback(
    async (nextPath?: string | null): Promise<string | null> => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: authCallbackUrl(nextPath) },
      });
      return error ? mapAuthError(error) : null;
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      signInWithMagicLink,
      signInWithGoogle,
      signOut,
    }),
    [status, session, signInWithMagicLink, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Convert Supabase's `AuthError` into a stable code string the UI can map
 * to a localised message. Keep the list short — most errors fall through
 * to a generic message.
 */
function mapAuthError(err: AuthError): string {
  const msg = err.message.toLowerCase();
  if (msg.includes('invalid') && msg.includes('email')) return 'invalidEmail';
  return 'generic';
}
