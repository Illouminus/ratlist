/**
 * `useProfile` — fetches the current authenticated user's profile row from
 * `public.profiles`. Profiles are auto-created by the `handle_new_user`
 * Postgres trigger on first sign-up, so a row should always exist for a
 * signed-in user.
 *
 * The return is a `ProfileQuery` discriminated union so callers can
 * pattern-match on the state cleanly instead of juggling nullables.
 *
 * Implementation note: we deliberately store ONLY the async-fetched data
 * (or error) in local state, and derive the rest of the query state with
 * `useMemo` from `useAuth()`. That avoids the `setState`-in-effect pattern
 * the React docs warn against — state is only updated after the fetch
 * resolves, never synchronously inside the effect body.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/db';
import { useAuth } from './useAuth';

// Cross-instance refresh. `useProfile` keeps its data in per-hook state
// (no shared context), so a mutation in one place — e.g. an avatar upload
// in Settings — wouldn't reach the Sidebar's separate instance. A
// lightweight window event lets any successful profile write nudge every
// mounted `useProfile` to re-fetch. `refresh` itself never dispatches, so
// the listener can't loop.
const PROFILE_CHANGED_EVENT = 'kryska:profile-changed';

/** Call after writing to the current user's profile so every mounted
 *  `useProfile` (Sidebar, Settings, …) re-fetches. */
export function notifyProfileChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
  }
}

export type ProfileQuery =
  | { status: 'loading'; profile: null; error: null }
  | { status: 'anonymous'; profile: null; error: null }
  | { status: 'ready'; profile: Profile; error: null }
  | { status: 'error'; profile: null; error: string };

interface UseProfileResult {
  query: ProfileQuery;
  /** Re-run the fetch — call after updating the profile elsewhere. */
  refresh: () => Promise<void>;
}

/**
 * Local state for the async fetch. `userId` tags each result so we can
 * detect a stale cache from a previous user.
 */
type FetchState =
  | { kind: 'idle' }
  | { kind: 'loaded'; userId: string; profile: Profile }
  | { kind: 'failed'; userId: string; error: string };

export function useProfile(): UseProfileResult {
  const { user, status: authStatus } = useAuth();
  const [fetched, setFetched] = useState<FetchState>({ kind: 'idle' });

  // Re-fetch whenever the authenticated user changes. setState only fires
  // after the network round-trip resolves, so this effect doesn't trigger
  // a same-tick render storm.
  useEffect(() => {
    if (authStatus !== 'authenticated' || !user) return undefined;

    const userId = user.id;
    let cancelled = false;

    void supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setFetched({ kind: 'failed', userId, error: error.message });
        } else if (!data) {
          setFetched({ kind: 'failed', userId, error: 'profile row missing' });
        } else {
          setFetched({ kind: 'loaded', userId, profile: data });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authStatus, user]);

  const query = useMemo<ProfileQuery>(() => {
    if (authStatus === 'loading') return { status: 'loading', profile: null, error: null };
    if (authStatus === 'anonymous' || !user) {
      return { status: 'anonymous', profile: null, error: null };
    }
    // authenticated. If the cached fetch is for a different user (stale),
    // treat it as still loading.
    if (fetched.kind === 'idle' || fetched.userId !== user.id) {
      return { status: 'loading', profile: null, error: null };
    }
    if (fetched.kind === 'loaded') {
      return { status: 'ready', profile: fetched.profile, error: null };
    }
    return { status: 'error', profile: null, error: fetched.error };
  }, [authStatus, user, fetched]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!user) return;
    const userId = user.id;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      setFetched({ kind: 'failed', userId, error: error.message });
    } else if (!data) {
      setFetched({ kind: 'failed', userId, error: 'profile row missing' });
    } else {
      setFetched({ kind: 'loaded', userId, profile: data });
    }
  }, [user]);

  // Re-fetch when any other mounted instance signals a profile write
  // (notifyProfileChanged). Keeps the Sidebar avatar in sync with a
  // Settings-screen upload without a shared context.
  useEffect(() => {
    function onChanged(): void {
      void refresh();
    }
    window.addEventListener(PROFILE_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PROFILE_CHANGED_EVENT, onChanged);
  }, [refresh]);

  return { query, refresh };
}
