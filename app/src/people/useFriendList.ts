/**
 * `useFriendList(userId)` — load a single friend's wishlist plus the
 * claims on each item (which the friend themselves cannot see — RLS
 * hides them from the owner, but the caller is not the owner here).
 *
 * Also exposes `claim(itemId)` and `release(itemId)` so the screen
 * doesn't need a separate mutation hook. Both go through Supabase
 * directly; RLS makes sure you can't claim your own items and can only
 * delete your own claims.
 *
 * Same async-only-setState pattern as our other hooks: pure free
 * fetchers + setState only inside `.then(...)`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import type { Item, Profile } from '../lib/db';

/** A claim joined with the claiming user's basic profile fields. */
export interface ClaimWithUser {
  id: string;
  item_id: string;
  user_id: string;
  share: number;
  note: string | null;
  created_at: string;
  user: Pick<Profile, 'id' | 'display_name' | 'handle' | 'avatar_url'>;
}

/** An item enriched with its claims. */
export interface FriendItem extends Item {
  claims: ClaimWithUser[];
}

export type FriendListQuery =
  | { status: 'loading'; profile: null; items: null; error: null }
  | { status: 'anonymous'; profile: null; items: null; error: null }
  | {
      status: 'ready';
      profile: Pick<Profile, 'id' | 'display_name' | 'handle' | 'avatar_url'>;
      items: FriendItem[];
      error: null;
    }
  | { status: 'error'; profile: null; items: null; error: string };

export interface UseFriendListResult {
  query: FriendListQuery;
  refresh: () => Promise<void>;
  /** Claim an item for the current user. No-op if already claimed. */
  claim: (itemId: string) => Promise<{ ok: true } | { error: string }>;
  /** Release my own claim on an item. RLS rejects releasing others'. */
  release: (itemId: string) => Promise<{ ok: true } | { error: string }>;
}

// Internal: the row shape that comes back from PostgREST with the embed.
interface RawFriendItemRow extends Item {
  claims: Array<{
    id: string;
    item_id: string;
    user_id: string;
    share: number;
    note: string | null;
    created_at: string;
    user: Pick<Profile, 'id' | 'display_name' | 'handle' | 'avatar_url'> | null;
  }> | null;
}

type FetchState =
  | { kind: 'idle' }
  | {
      kind: 'loaded';
      targetId: string;
      profile: Pick<Profile, 'id' | 'display_name' | 'handle' | 'avatar_url'>;
      items: FriendItem[];
    }
  | { kind: 'failed'; targetId: string; error: string };

async function loadFriendList(targetId: string): Promise<FetchState> {
  // Two queries in parallel: the profile + the items with claims embed.
  const [profileRes, itemsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, handle, avatar_url')
      .eq('id', targetId)
      .maybeSingle(),
    supabase
      .from('items')
      .select(
        'id, owner_id, title, maker, url, price_text, occasion, priority, note, status, cover_url, created_at, updated_at, ' +
          'claims(id, item_id, user_id, share, note, created_at, user:profiles!claims_user_id_fkey(id, display_name, handle, avatar_url))',
      )
      .eq('owner_id', targetId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .returns<RawFriendItemRow[]>(),
  ]);

  if (profileRes.error) {
    return { kind: 'failed', targetId, error: profileRes.error.message };
  }
  if (!profileRes.data) {
    return { kind: 'failed', targetId, error: 'profile not found' };
  }
  if (itemsRes.error) {
    return { kind: 'failed', targetId, error: itemsRes.error.message };
  }

  const items: FriendItem[] = (itemsRes.data ?? []).map((row) => ({
    ...row,
    claims: (row.claims ?? [])
      .filter((c): c is typeof c & { user: NonNullable<typeof c.user> } => c.user !== null)
      .map((c) => ({
        id: c.id,
        item_id: c.item_id,
        user_id: c.user_id,
        share: c.share,
        note: c.note,
        created_at: c.created_at,
        user: c.user,
      })),
  }));

  return {
    kind: 'loaded',
    targetId,
    profile: profileRes.data,
    items,
  };
}

export function useFriendList(targetUserId: string | null): UseFriendListResult {
  const { user, status: authStatus } = useAuth();
  const [fetched, setFetched] = useState<FetchState>({ kind: 'idle' });

  useEffect(() => {
    if (authStatus !== 'authenticated' || !user || !targetUserId) return undefined;
    const id = targetUserId;
    let cancelled = false;

    void loadFriendList(id).then((state) => {
      if (!cancelled) setFetched(state);
    });

    return () => {
      cancelled = true;
    };
  }, [authStatus, user, targetUserId]);

  const query = useMemo<FriendListQuery>(() => {
    if (authStatus === 'loading') {
      return { status: 'loading', profile: null, items: null, error: null };
    }
    if (authStatus === 'anonymous' || !user) {
      return { status: 'anonymous', profile: null, items: null, error: null };
    }
    if (!targetUserId) {
      return { status: 'error', profile: null, items: null, error: 'no target user' };
    }
    if (fetched.kind === 'idle' || fetched.targetId !== targetUserId) {
      return { status: 'loading', profile: null, items: null, error: null };
    }
    if (fetched.kind === 'loaded') {
      return {
        status: 'ready',
        profile: fetched.profile,
        items: fetched.items,
        error: null,
      };
    }
    return { status: 'error', profile: null, items: null, error: fetched.error };
  }, [authStatus, user, targetUserId, fetched]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!targetUserId) return;
    const state = await loadFriendList(targetUserId);
    setFetched(state);
  }, [targetUserId]);

  const claim = useCallback(
    async (itemId: string): Promise<{ ok: true } | { error: string }> => {
      if (!user || !targetUserId) return { error: 'not authenticated' };
      const { error } = await supabase
        .from('claims')
        .insert({ item_id: itemId, user_id: user.id });
      if (error) return { error: error.message };
      const state = await loadFriendList(targetUserId);
      setFetched(state);
      return { ok: true };
    },
    [user, targetUserId],
  );

  const release = useCallback(
    async (itemId: string): Promise<{ ok: true } | { error: string }> => {
      if (!user || !targetUserId) return { error: 'not authenticated' };
      const { error } = await supabase
        .from('claims')
        .delete()
        .eq('item_id', itemId)
        .eq('user_id', user.id);
      if (error) return { error: error.message };
      const state = await loadFriendList(targetUserId);
      setFetched(state);
      return { ok: true };
    },
    [user, targetUserId],
  );

  return { query, refresh, claim, release };
}
