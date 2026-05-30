/**
 * `useCoparticipantList(memberId)` — load another event member's SHARED items
 * for discovery ("grab an idea"). Reads through the `get_coparticipant_list`
 * RPC (SECURITY DEFINER, gated on `shares_event_with`), plus the member's
 * profile for the header. No claims — the only action on this list is "copy
 * to my list".
 *
 * Same async-only-setState pattern as the other hooks: pure free fetcher +
 * setState only inside `.then(...)`.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import type { Item, Profile } from '../lib/db';

type MemberProfile = Pick<Profile, 'id' | 'display_name' | 'handle' | 'avatar_url'>;

export type CoparticipantListQuery =
  | { status: 'loading'; profile: null; items: null; error: null }
  | { status: 'anonymous'; profile: null; items: null; error: null }
  | { status: 'ready'; profile: MemberProfile; items: Item[]; error: null }
  | { status: 'error'; profile: null; items: null; error: string };

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loaded'; targetId: string; profile: MemberProfile; items: Item[] }
  | { kind: 'failed'; targetId: string; error: string };

async function load(targetId: string): Promise<FetchState> {
  const [profileRes, itemsRes] = await Promise.all([
    supabase.from('profiles').select('id, display_name, handle, avatar_url').eq('id', targetId).maybeSingle(),
    supabase.rpc('get_coparticipant_list', { _member_id: targetId }),
  ]);
  if (profileRes.error) return { kind: 'failed', targetId, error: profileRes.error.message };
  if (!profileRes.data) return { kind: 'failed', targetId, error: 'profile not found' };
  if (itemsRes.error) return { kind: 'failed', targetId, error: itemsRes.error.message };
  return { kind: 'loaded', targetId, profile: profileRes.data, items: (itemsRes.data ?? []) as Item[] };
}

export function useCoparticipantList(targetUserId: string | null): { query: CoparticipantListQuery } {
  const { user, status: authStatus } = useAuth();
  const [fetched, setFetched] = useState<FetchState>({ kind: 'idle' });

  useEffect(() => {
    if (authStatus !== 'authenticated' || !user || !targetUserId) return undefined;
    const id = targetUserId;
    let cancelled = false;
    void load(id).then((state) => {
      if (!cancelled) setFetched(state);
    });
    return () => {
      cancelled = true;
    };
  }, [authStatus, user, targetUserId]);

  const query = useMemo<CoparticipantListQuery>(() => {
    if (authStatus === 'loading') return { status: 'loading', profile: null, items: null, error: null };
    if (authStatus === 'anonymous' || !user) return { status: 'anonymous', profile: null, items: null, error: null };
    if (!targetUserId) return { status: 'error', profile: null, items: null, error: 'no target user' };
    if (fetched.kind === 'idle' || fetched.targetId !== targetUserId) {
      return { status: 'loading', profile: null, items: null, error: null };
    }
    if (fetched.kind === 'loaded') {
      return { status: 'ready', profile: fetched.profile, items: fetched.items, error: null };
    }
    return { status: 'error', profile: null, items: null, error: fetched.error };
  }, [authStatus, user, targetUserId, fetched]);

  return { query };
}
