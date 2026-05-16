/**
 * `useGroups` — list the current user's groups + create new ones.
 *
 * Returns a discriminated `GroupsQuery` so callers can switch over
 * loading / ready / error / anonymous without juggling nullables.
 *
 * The list is sourced from the `get_my_groups()` RPC, which already
 * filters to the caller's groups, attaches the caller's role, and counts
 * members — no client-side joining required.
 *
 * Implementation note: the async fetch is a free function that returns
 * the new `FetchState`. The effect/hook only calls `setFetched` from
 * inside `.then(...)` so we never sync-setState inside an effect body.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';

/** A group row enriched with the caller's role and the group's size. */
export interface MyGroup {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  role: 'admin' | 'member';
  member_count: number;
}

export type GroupsQuery =
  | { status: 'loading'; groups: null; error: null }
  | { status: 'anonymous'; groups: null; error: null }
  | { status: 'ready'; groups: MyGroup[]; error: null }
  | { status: 'error'; groups: null; error: string };

export interface CreateGroupInput {
  name: string;
  emoji?: string | null;
  description?: string | null;
}

export interface UseGroupsResult {
  query: GroupsQuery;
  refresh: () => Promise<void>;
  /**
   * Create a new group. The creating user is auto-added as an admin via
   * the `bootstrap_group_admin` trigger. Returns the new group on success
   * or an error string.
   */
  createGroup: (input: CreateGroupInput) => Promise<{ group: MyGroup } | { error: string }>;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loaded'; userId: string; groups: MyGroup[] }
  | { kind: 'failed'; userId: string; error: string };

/** Pure async fetcher — never touches React state directly. */
async function loadGroups(userId: string): Promise<FetchState> {
  const { data, error } = await supabase.rpc('get_my_groups');
  if (error) return { kind: 'failed', userId, error: error.message };
  return { kind: 'loaded', userId, groups: (data ?? []) as MyGroup[] };
}

export function useGroups(): UseGroupsResult {
  const { user, status: authStatus } = useAuth();
  const [fetched, setFetched] = useState<FetchState>({ kind: 'idle' });

  // Re-fetch on user change. setState happens inside `.then()`, i.e. after
  // the network round-trip yields, so it doesn't violate the no-setState-
  // in-effect-body rule.
  useEffect(() => {
    if (authStatus !== 'authenticated' || !user) return undefined;
    const userId = user.id;
    let cancelled = false;

    void loadGroups(userId).then((state) => {
      if (!cancelled) setFetched(state);
    });

    return () => {
      cancelled = true;
    };
  }, [authStatus, user]);

  const query = useMemo<GroupsQuery>(() => {
    if (authStatus === 'loading') return { status: 'loading', groups: null, error: null };
    if (authStatus === 'anonymous' || !user) {
      return { status: 'anonymous', groups: null, error: null };
    }
    if (fetched.kind === 'idle' || fetched.userId !== user.id) {
      return { status: 'loading', groups: null, error: null };
    }
    if (fetched.kind === 'loaded') {
      return { status: 'ready', groups: fetched.groups, error: null };
    }
    return { status: 'error', groups: null, error: fetched.error };
  }, [authStatus, user, fetched]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!user) return;
    const state = await loadGroups(user.id);
    setFetched(state);
  }, [user]);

  const createGroup = useCallback(
    async (input: CreateGroupInput): Promise<{ group: MyGroup } | { error: string }> => {
      if (!user) return { error: 'not authenticated' };

      // Atomic insert + admin bootstrap via SECURITY DEFINER RPC. The
      // earlier `INSERT...RETURNING *` flow was broken by RLS ordering
      // around AFTER triggers (see 20260516131836_create_group_rpc.sql);
      // routing through the RPC also lets us return a typed `groups` row
      // straight away.
      const { data, error } = await supabase.rpc('create_group', {
        _name: input.name,
        // RPC args are typed `?: string` (not nullable), so pass undefined
        // for "not set" rather than null — the function treats both the
        // same (nullif + btrim) on the SQL side.
        _emoji: input.emoji ?? undefined,
        _description: input.description ?? undefined,
      });

      if (error || !data) return { error: error?.message ?? 'unknown error' };

      // The RPC returns the bare `groups` row. We synthesise the
      // MyGroup shape locally (role=admin, member_count=1) so the
      // caller can render immediately; the refresh below replaces it
      // with the canonical aggregate from get_my_groups().
      const group: MyGroup = {
        id: data.id,
        name: data.name,
        emoji: data.emoji,
        description: data.description,
        created_by: data.created_by,
        created_at: data.created_at,
        updated_at: data.updated_at,
        role: 'admin',
        member_count: 1,
      };

      const state = await loadGroups(user.id);
      setFetched(state);
      return { group };
    },
    [user],
  );

  return { query, refresh, createGroup };
}
