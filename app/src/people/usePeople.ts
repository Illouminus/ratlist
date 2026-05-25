/**
 * `usePeople` — the auto-populated friends list, derived from real event
 * interactions (link-first model). Backed by `get_my_people()`: returns
 * users you've shared at least one event with (as honoree or active
 * participant). No group-share path anymore.
 *
 * Shape mirrors the RPC: user_id renamed to `id` for compat with the
 * legacy Link-to-friend-list `/p/:userId` consumer. Old fields
 * (preview_titles, item_count, shared_group_count) are gone — the
 * coordinator's view of someone happens through `/p/:userId` and
 * `FriendListScreen`, not through previews on the directory row.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';

export interface Person {
  /** auth.users.id — same value as user_id from the RPC, renamed for
   *  compat with existing consumers that build /p/:userId links. */
  id: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  /** True when the person has a /share/<token> wishlist available. */
  has_public_list: boolean;
  /** ISO timestamp of last shared-event interaction; null only if the
   *  RPC returns nothing (won't happen in practice — at least one event
   *  is required to populate). */
  last_interaction_at: string | null;
}

export type PeopleQuery =
  | { status: 'loading'; people: null; error: null }
  | { status: 'anonymous'; people: null; error: null }
  | { status: 'ready'; people: Person[]; error: null }
  | { status: 'error'; people: null; error: string };

export interface UsePeopleResult {
  query: PeopleQuery;
  refresh: () => Promise<void>;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loaded'; userId: string; people: Person[] }
  | { kind: 'failed'; userId: string; error: string };

async function loadPeople(userId: string): Promise<FetchState> {
  const { data, error } = await supabase.rpc('get_my_people');
  if (error) return { kind: 'failed', userId, error: error.message };

  type Row = {
    user_id: string;
    display_name: string;
    handle: string | null;
    avatar_url: string | null;
    has_public_list: boolean;
    last_interaction_at: string | null;
  };

  const people: Person[] = ((data ?? []) as Row[]).map((r) => ({
    id: r.user_id,
    display_name: r.display_name,
    handle: r.handle,
    avatar_url: r.avatar_url,
    has_public_list: r.has_public_list,
    last_interaction_at: r.last_interaction_at,
  }));

  return { kind: 'loaded', userId, people };
}

export function usePeople(): UsePeopleResult {
  const { user, status: authStatus } = useAuth();
  const [fetched, setFetched] = useState<FetchState>({ kind: 'idle' });

  useEffect(() => {
    if (authStatus !== 'authenticated' || !user) return undefined;
    const userId = user.id;
    let cancelled = false;

    void loadPeople(userId).then((state) => {
      if (!cancelled) setFetched(state);
    });

    return () => {
      cancelled = true;
    };
  }, [authStatus, user]);

  const query = useMemo<PeopleQuery>(() => {
    if (authStatus === 'loading') return { status: 'loading', people: null, error: null };
    if (authStatus === 'anonymous' || !user) {
      return { status: 'anonymous', people: null, error: null };
    }
    if (fetched.kind === 'idle' || fetched.userId !== user.id) {
      return { status: 'loading', people: null, error: null };
    }
    if (fetched.kind === 'loaded') {
      return { status: 'ready', people: fetched.people, error: null };
    }
    return { status: 'error', people: null, error: fetched.error };
  }, [authStatus, user, fetched]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!user) return;
    const state = await loadPeople(user.id);
    setFetched(state);
  }, [user]);

  return { query, refresh };
}
