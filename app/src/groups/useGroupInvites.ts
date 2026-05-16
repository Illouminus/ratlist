/**
 * `useGroupInvites` — list and manage active invite links for a single
 * group. "Active" means not yet redeemed and not expired.
 *
 * Invite tokens are generated server-side via the `gen_random_bytes()`
 * default on the `invites.token` column; the client only inserts the
 * `group_id` and lets the DB fill the rest.
 *
 * Like `useGroups`, async fetches are pure free functions; `setFetched`
 * is only called from `.then(...)` callbacks so we never sync-setState
 * inside an effect body.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import type { Invite } from '../lib/db';

export type InvitesQuery =
  | { status: 'loading'; invites: null; error: null }
  | { status: 'ready'; invites: Invite[]; error: null }
  | { status: 'error'; invites: null; error: string };

export interface UseGroupInvitesResult {
  query: InvitesQuery;
  refresh: () => Promise<void>;
  /** Create a new invite token bound to this group. */
  generate: () => Promise<{ invite: Invite } | { error: string }>;
  /** Revoke (delete) an invite by its token. */
  revoke: (token: string) => Promise<{ ok: true } | { error: string }>;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loaded'; groupId: string; invites: Invite[] }
  | { kind: 'failed'; groupId: string; error: string };

/** Pure async fetcher — never touches React state directly. */
async function loadInvites(groupId: string): Promise<FetchState> {
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('group_id', groupId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) return { kind: 'failed', groupId, error: error.message };
  return { kind: 'loaded', groupId, invites: (data ?? []) as Invite[] };
}

export function useGroupInvites(groupId: string | null): UseGroupInvitesResult {
  const { user } = useAuth();
  const [fetched, setFetched] = useState<FetchState>({ kind: 'idle' });

  useEffect(() => {
    if (!groupId) return undefined;
    const gid = groupId;
    let cancelled = false;

    void loadInvites(gid).then((state) => {
      if (!cancelled) setFetched(state);
    });

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const query = useMemo<InvitesQuery>(() => {
    if (!groupId) return { status: 'loading', invites: null, error: null };
    if (fetched.kind === 'idle' || fetched.groupId !== groupId) {
      return { status: 'loading', invites: null, error: null };
    }
    if (fetched.kind === 'loaded') {
      return { status: 'ready', invites: fetched.invites, error: null };
    }
    return { status: 'error', invites: null, error: fetched.error };
  }, [groupId, fetched]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!groupId) return;
    const state = await loadInvites(groupId);
    setFetched(state);
  }, [groupId]);

  const generate = useCallback(async (): Promise<{ invite: Invite } | { error: string }> => {
    if (!groupId || !user) return { error: 'not authenticated' };
    const { data, error } = await supabase
      .from('invites')
      .insert({ group_id: groupId, created_by: user.id })
      .select('*')
      .single();
    if (error || !data) return { error: error?.message ?? 'unknown error' };
    const state = await loadInvites(groupId);
    setFetched(state);
    return { invite: data as Invite };
  }, [groupId, user]);

  const revoke = useCallback(
    async (token: string): Promise<{ ok: true } | { error: string }> => {
      if (!groupId) return { error: 'no group' };
      const { error } = await supabase.from('invites').delete().eq('token', token);
      if (error) return { error: error.message };
      const state = await loadInvites(groupId);
      setFetched(state);
      return { ok: true };
    },
    [groupId],
  );

  return { query, refresh, generate, revoke };
}
