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

/** Where Supabase should redirect after the user clicks the magic link. */
function authCallbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
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

  const signInWithMagicLink = useCallback(async (email: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: authCallbackUrl() },
    });
    return error ? mapAuthError(error) : null;
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authCallbackUrl() },
    });
    return error ? mapAuthError(error) : null;
  }, []);

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
