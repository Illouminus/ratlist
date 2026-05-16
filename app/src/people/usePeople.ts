/**
 * `usePeople` — directory of users I share at least one group with.
 *
 * Backed by the `get_people()` RPC, which already excludes the caller
 * and attaches the shared-group count.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';

export interface Person {
  id: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  shared_group_count: number;
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
  const { data, error } = await supabase.rpc('get_people');
  if (error) return { kind: 'failed', userId, error: error.message };

  // RPC returns columns as non-null but in practice handle/avatar_url can
  // be null. Cast through a shape that matches reality.
  const rows = (data ?? []) as Array<{
    id: string;
    display_name: string;
    handle: string | null;
    avatar_url: string | null;
    shared_group_count: number;
  }>;
  return { kind: 'loaded', userId, people: rows };
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
