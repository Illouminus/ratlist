/**
 * `useGroupMembers(groupId)` — list a group's members with their profile
 * details, plus admin-level actions (promote, demote, kick) and a
 * leave-self action.
 *
 * All write paths go through plain table operations — RLS on
 * `group_members` already restricts them appropriately:
 *
 *   - SELECT: fellow members can read
 *   - UPDATE (role only): admins can change
 *   - DELETE: self can remove self, admins can remove anyone
 *   - INSERT: admins (used for redeem_invite, not here)
 *
 * Safety: the UI guards against "kick the last admin" / "demote the last
 * admin" / "leave when you're the last admin" by calling the
 * `group_admin_count` SECURITY DEFINER RPC and refusing the action with
 * a friendly `last_admin` error before any write. The DB has no trigger
 * enforcing this — we keep it client-side to surface a localised message
 * rather than a constraint violation.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';

export type MemberRole = 'admin' | 'member';

export interface GroupMember {
  user_id: string;
  role: MemberRole;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
}

export type MembersQuery =
  | { status: 'loading'; members: null; error: null }
  | { status: 'anonymous'; members: null; error: null }
  | { status: 'ready'; members: GroupMember[]; error: null }
  | { status: 'error'; members: null; error: string };

export interface UseGroupMembersResult {
  query: MembersQuery;
  refresh: () => Promise<void>;
  /** Promote a member to admin. Admin-only. */
  promote: (userId: string) => Promise<{ ok: true } | { error: string }>;
  /** Demote an admin to member. Admin-only. Refuses to demote the
   *  last admin in the group. */
  demote: (userId: string) => Promise<{ ok: true } | { error: string }>;
  /** Remove someone from the group. Admin-only. Refuses to kick the
   *  last admin. */
  kick: (userId: string) => Promise<{ ok: true } | { error: string }>;
  /** Remove the current user from the group. Refuses if they are the
   *  last admin AND there are other members left. */
  leave: () => Promise<{ ok: true } | { error: string }>;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loaded'; groupId: string; members: GroupMember[] }
  | { kind: 'failed'; groupId: string; error: string };

interface MemberRow {
  user_id: string;
  role: MemberRole;
  // PostgREST `select=...,profiles(...)` returns either a single object
  // or an array depending on the relationship cardinality. For a
  // user_id → profiles.id link it's a single object, but the generated
  // types sometimes widen it. Accept both and narrow at runtime.
  profiles:
    | { display_name: string; handle: string | null; avatar_url: string | null }
    | Array<{ display_name: string; handle: string | null; avatar_url: string | null }>
    | null;
}

async function loadMembers(groupId: string): Promise<FetchState> {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, role, profiles(display_name, handle, avatar_url)')
    .eq('group_id', groupId)
    .returns<MemberRow[]>();

  if (error) return { kind: 'failed', groupId, error: error.message };

  const members: GroupMember[] = (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      user_id: row.user_id,
      role: row.role,
      display_name: profile?.display_name ?? '?',
      handle: profile?.handle ?? null,
      avatar_url: profile?.avatar_url ?? null,
    };
  });

  // Stable order: admins first, then alphabetical display name. Helps
  // the UI render predictably across refreshes.
  members.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
    return a.display_name.localeCompare(b.display_name);
  });

  return { kind: 'loaded', groupId, members };
}

/** Fetch the current admin count for the group via the helper RPC.
 *  Returns null on transport error so callers can fall through to a
 *  generic error rather than block legitimate actions on a transient
 *  network blip. */
async function adminCount(groupId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('group_admin_count', { _group_id: groupId });
  if (error || typeof data !== 'number') return null;
  return data;
}

export function useGroupMembers(groupId: string | null): UseGroupMembersResult {
  const { user, status: authStatus } = useAuth();
  const [fetched, setFetched] = useState<FetchState>({ kind: 'idle' });

  useEffect(() => {
    if (authStatus !== 'authenticated' || !user || !groupId) return undefined;
    let cancelled = false;

    void loadMembers(groupId).then((state) => {
      if (!cancelled) setFetched(state);
    });

    return () => {
      cancelled = true;
    };
  }, [authStatus, user, groupId]);

  const query = useMemo<MembersQuery>(() => {
    if (authStatus === 'loading') return { status: 'loading', members: null, error: null };
    if (authStatus === 'anonymous' || !user) {
      return { status: 'anonymous', members: null, error: null };
    }
    if (!groupId || fetched.kind === 'idle' || fetched.groupId !== groupId) {
      return { status: 'loading', members: null, error: null };
    }
    if (fetched.kind === 'loaded') {
      return { status: 'ready', members: fetched.members, error: null };
    }
    return { status: 'error', members: null, error: fetched.error };
  }, [authStatus, user, groupId, fetched]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!groupId) return;
    const state = await loadMembers(groupId);
    setFetched(state);
  }, [groupId]);

  // Realtime: react to any change in this group's membership — new
  // joiners via invite, role flips (promote/demote), kicks, leaves.
  // RLS already restricts which events reach us, so we don't need to
  // double-filter here.
  useEffect(() => {
    if (authStatus !== 'authenticated' || !user || !groupId) return undefined;
    const channel = supabase
      .channel(`group-members:${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_members',
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authStatus, user, groupId, refresh]);

  const promote = useCallback(
    async (userId: string): Promise<{ ok: true } | { error: string }> => {
      if (!groupId) return { error: 'no group' };
      const { error } = await supabase
        .from('group_members')
        .update({ role: 'admin' })
        .eq('group_id', groupId)
        .eq('user_id', userId);
      if (error) return { error: error.message };
      await refresh();
      return { ok: true };
    },
    [groupId, refresh],
  );

  const demote = useCallback(
    async (userId: string): Promise<{ ok: true } | { error: string }> => {
      if (!groupId) return { error: 'no group' };
      const count = await adminCount(groupId);
      if (count === 1) return { error: 'last_admin' };

      const { error } = await supabase
        .from('group_members')
        .update({ role: 'member' })
        .eq('group_id', groupId)
        .eq('user_id', userId);
      if (error) return { error: error.message };
      await refresh();
      return { ok: true };
    },
    [groupId, refresh],
  );

  const kick = useCallback(
    async (userId: string): Promise<{ ok: true } | { error: string }> => {
      if (!groupId) return { error: 'no group' };

      // If we're about to remove an admin, make sure there's at least
      // one other admin left so the group doesn't end up ownerless.
      const target = fetched.kind === 'loaded'
        ? fetched.members.find((m) => m.user_id === userId)
        : null;
      if (target?.role === 'admin') {
        const count = await adminCount(groupId);
        if (count === 1) return { error: 'last_admin' };
      }

      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);
      if (error) return { error: error.message };
      await refresh();
      return { ok: true };
    },
    [groupId, fetched, refresh],
  );

  const leave = useCallback(async (): Promise<{ ok: true } | { error: string }> => {
    if (!user || !groupId) return { error: 'not authenticated' };

    // Same last-admin guard as kick(), but framed for the caller leaving
    // their own group: only block if there are other members left who'd
    // be orphaned by us walking out.
    const myRole =
      fetched.kind === 'loaded'
        ? fetched.members.find((m) => m.user_id === user.id)?.role
        : null;
    const otherMembers =
      fetched.kind === 'loaded'
        ? fetched.members.filter((m) => m.user_id !== user.id).length
        : 0;
    if (myRole === 'admin' && otherMembers > 0) {
      const count = await adminCount(groupId);
      if (count === 1) return { error: 'last_admin' };
    }

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', user.id);
    if (error) return { error: error.message };
    return { ok: true };
  }, [user, groupId, fetched]);

  return { query, refresh, promote, demote, kick, leave };
}
