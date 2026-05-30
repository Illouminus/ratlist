/**
 * `useShareToken()` — read/toggle the caller's public share token.
 *
 * The token is a per-user opaque string stored on `profiles`. When set,
 * anyone hitting `/share/<token>` sees a read-only version of the
 * caller's wishlist; when null, the share URL is dead.
 *
 * The hook also exposes `enable()` / `disable()` for the obvious
 * toggles, plus a `rotate()` (same as enable, but with the explicit
 * intent of invalidating the old URL). All three are thin wrappers
 * around the `set_share_token(boolean)` RPC.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';

// `useShareToken` is per-hook local state, so a mutation in one instance
// (the ShareDialog) is invisible to another (the activation checklist on
// MyList) until a full re-fetch. Mirror `notifyProfileChanged`: the
// mutators dispatch this window event and every mounted instance re-fetches.
// The re-fetch never dispatches, so the listener can't loop.
const SHARE_TOKEN_CHANGED_EVENT = 'kryska:share-token-changed';

/** Call after toggling the caller's share token so every mounted
 *  `useShareToken` (ShareDialog, ActivationChecklist, …) re-fetches. */
export function notifyShareTokenChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SHARE_TOKEN_CHANGED_EVENT));
  }
}

export type ShareQuery =
  | { status: 'loading'; token: null; error: null }
  | { status: 'anonymous'; token: null; error: null }
  | { status: 'ready'; token: string | null; error: null }
  | { status: 'error'; token: null; error: string };

export interface UseShareTokenResult {
  query: ShareQuery;
  /** Generate (or regenerate) the token. Same as `rotate()`. */
  enable: () => Promise<{ token: string } | { error: string }>;
  /** Clear the token — the existing share URL stops working. */
  disable: () => Promise<{ ok: true } | { error: string }>;
  /** Rotate: shorthand for enable() when sharing is already on. */
  rotate: () => Promise<{ token: string } | { error: string }>;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loaded'; userId: string; token: string | null }
  | { kind: 'failed'; userId: string; error: string };

async function loadToken(userId: string): Promise<FetchState> {
  const { data, error } = await supabase
    .from('profile_secrets')
    .select('share_token')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { kind: 'failed', userId, error: error.message };
  return { kind: 'loaded', userId, token: data?.share_token ?? null };
}

export function useShareToken(): UseShareTokenResult {
  const { user, status: authStatus } = useAuth();
  const [fetched, setFetched] = useState<FetchState>({ kind: 'idle' });

  useEffect(() => {
    if (authStatus !== 'authenticated' || !user) return undefined;
    const userId = user.id;
    let cancelled = false;
    void loadToken(userId).then((state) => {
      if (!cancelled) setFetched(state);
    });
    return () => {
      cancelled = true;
    };
  }, [authStatus, user]);

  // Cross-instance sync: when any instance toggles the token, re-fetch so
  // this one reflects it without a page reload (e.g. the activation
  // checklist ticking the moment the ShareDialog enables sharing).
  useEffect(() => {
    if (authStatus !== 'authenticated' || !user) return undefined;
    const userId = user.id;
    function onChanged() {
      void loadToken(userId).then((state) => setFetched(state));
    }
    window.addEventListener(SHARE_TOKEN_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(SHARE_TOKEN_CHANGED_EVENT, onChanged);
  }, [authStatus, user]);

  const query = useMemo<ShareQuery>(() => {
    if (authStatus === 'loading') return { status: 'loading', token: null, error: null };
    if (authStatus === 'anonymous' || !user) {
      return { status: 'anonymous', token: null, error: null };
    }
    if (fetched.kind === 'idle' || fetched.userId !== user.id) {
      return { status: 'loading', token: null, error: null };
    }
    if (fetched.kind === 'loaded') {
      return { status: 'ready', token: fetched.token, error: null };
    }
    return { status: 'error', token: null, error: fetched.error };
  }, [authStatus, user, fetched]);

  const enable = useCallback(async (): Promise<{ token: string } | { error: string }> => {
    if (!user) return { error: 'not authenticated' };
    const { data, error } = await supabase.rpc('set_share_token', { _enabled: true });
    if (error || typeof data !== 'string') return { error: error?.message ?? 'unknown error' };
    setFetched({ kind: 'loaded', userId: user.id, token: data });
    notifyShareTokenChanged();
    return { token: data };
  }, [user]);

  const disable = useCallback(async (): Promise<{ ok: true } | { error: string }> => {
    if (!user) return { error: 'not authenticated' };
    const { error } = await supabase.rpc('set_share_token', { _enabled: false });
    if (error) return { error: error.message };
    setFetched({ kind: 'loaded', userId: user.id, token: null });
    notifyShareTokenChanged();
    return { ok: true };
  }, [user]);

  // `rotate` is just `enable` re-used — set_share_token(true) always
  // generates a fresh token. We keep the name distinct in the API so
  // call sites read like intent ("toggle on" vs "kill the old URL").
  const rotate = enable;

  return { query, enable, disable, rotate };
}
