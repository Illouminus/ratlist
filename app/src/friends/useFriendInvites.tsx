/**
 * `useFriendInvites` — the caller's pending sent friend invites (rows
 * in `friend_invites` where `accepted_at is null`). Used by
 * FriendsScreen for a "pending" section if any exist, and to allow
 * revoke (delete by token).
 *
 * Same fetch-then-setState pattern as `useFriends`. No realtime channel
 * here yet — invite rows turn over slowly and the consumer can call
 * `refresh()` after issuing a new one.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface PendingInvite {
  token: string;
  to_email: string;
  created_at: string;
  message: string | null;
}

export type PendingInvitesState =
  | { kind: 'loading' }
  | { kind: 'loaded'; invites: PendingInvite[] }
  | { kind: 'error'; message: string };

async function fetchPending(): Promise<PendingInvitesState> {
  const { data, error } = await supabase
    .from('friend_invites')
    .select('token, to_email, created_at, message')
    .is('accepted_at', null)
    .order('created_at', { ascending: false });
  if (error) return { kind: 'error', message: error.message };
  return { kind: 'loaded', invites: (data ?? []) as PendingInvite[] };
}

export interface UseFriendInvitesResult {
  state: PendingInvitesState;
  refresh: () => void;
  revoke: (token: string) => Promise<{ ok: true } | { ok: false; message: string }>;
}

export function useFriendInvites(): UseFriendInvitesResult {
  const [state, setState] = useState<PendingInvitesState>({ kind: 'loading' });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    void fetchPending().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const revoke = useCallback(
    async (token: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      const { error } = await supabase.from('friend_invites').delete().eq('token', token);
      if (error) return { ok: false, message: error.message };
      refresh();
      return { ok: true };
    },
    [refresh],
  );

  return { state, refresh, revoke };
}
