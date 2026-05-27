/**
 * `useFriends` — the caller's symmetric friendship list.
 *
 * Backed by `get_friends()` (PR-1 RPC): returns profile rows for every
 * `friendships` edge where the caller is one of the two endpoints.
 * Friendships are explicit edges (not derived from event interactions
 * the way `usePeople` was) — they're added via accept_friend_invite,
 * accept_add_me, or any future friend-flow RPC.
 *
 * Follows the standard hook pattern from the codebase: pure free async
 * fetcher returns the next state, then a `useEffect` calls it and
 * `setState` happens inside `.then(...)` — so updates always sit after
 * a yield, never synchronously inside the effect body (required by
 * `react-hooks/set-state-in-effect`).
 *
 * The realtime channel listens on the `friendships` table. RLS already
 * scopes change-events to rows the caller can see (their own edges),
 * so we don't need a server-side filter. Bursts (a friendship insert
 * fires one INSERT visible to BOTH endpoints, but on the caller's side
 * it's still one row) are collapsed by a 300 ms trailing debounce —
 * same pattern as `useEvents`.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { debounce } from '../lib/debounce';
import type { Database } from '../types/database';

type ProfileRow = Database['public']['Functions']['get_friends']['Returns'][number];

export type FriendsState =
  | { kind: 'loading' }
  | { kind: 'loaded'; friends: ProfileRow[] }
  | { kind: 'error'; message: string };

async function fetchFriends(): Promise<FriendsState> {
  const { data, error } = await supabase.rpc('get_friends');
  if (error) return { kind: 'error', message: error.message };
  return { kind: 'loaded', friends: (data ?? []) as ProfileRow[] };
}

export interface UseFriendsResult {
  state: FriendsState;
  refresh: () => void;
  unfriend: (otherId: string) => Promise<{ ok: true } | { ok: false; message: string }>;
}

export function useFriends(): UseFriendsResult {
  const { user } = useAuth();
  const [state, setState] = useState<FriendsState>({ kind: 'loading' });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    void fetchFriends().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  // Realtime: re-fetch (debounced) when friendships change anywhere.
  // RLS filters server-side to only the caller's own edges, so we
  // don't need a topic filter here. Channel name is scoped per user
  // to match the rest of the codebase (`my-events:<id>`, etc.).
  useEffect(() => {
    if (!user) return undefined;
    const trigger = debounce(refresh, 300);
    const channel = supabase
      .channel(`friendships:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        trigger,
      )
      .subscribe();
    return () => {
      trigger.cancel();
      void supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  const unfriend = useCallback(
    async (otherId: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      const { error } = await supabase.rpc('unfriend', { _other: otherId });
      if (error) return { ok: false, message: error.message };
      refresh();
      return { ok: true };
    },
    [refresh],
  );

  return { state, refresh, unfriend };
}
