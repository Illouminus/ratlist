/**
 * `useItem(itemId)` — load a single item by id, respecting RLS.
 *
 * Used by `ItemDetailScreen` for `/i/:itemId` so the route works as a
 * shareable URL — both for items the caller owns and for items a
 * friend has published into a shared group. The items SELECT policy
 * already gates visibility (owner OR via item_groups ∩ group_members),
 * so we just fetch and surface whatever PostgREST returns.
 *
 * Returns a discriminated query state, plus a `refresh()` for callers
 * that want to refetch after an action (e.g. claim/release on a
 * friend's item, or edit on the caller's own item).
 *
 * NOT for lists. The My-list and Friend-list screens load their
 * batches via dedicated hooks (`useMyItems`, `useFriendList`) which
 * use a single-query join and avoid N+1 round trips. `useItem` is the
 * detail-page complement.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import type { Item, Occasion, ItemStatus } from '../lib/db';

/** A row from `items` plus the groups it's published into and a stable
 *  flag for "is this mine?". The latter is computed against the current
 *  session's user id, not from the row itself, so callers don't need to
 *  thread `user.id` around.
 */
export interface FullItem {
  id: string;
  owner_id: string;
  title: string;
  maker: string | null;
  url: string | null;
  price_text: string | null;
  occasion: Occasion;
  priority: number;
  note: string | null;
  status: ItemStatus;
  cover_url: string | null;
  created_at: string;
  updated_at: string;
  /** Groups the item is published into. Empty = owner-only. */
  group_ids: string[];
  /** True iff the caller is the owner of this item. */
  is_mine: boolean;
}

export type ItemQuery =
  | { status: 'loading'; item: null; error: null }
  | { status: 'anonymous'; item: null; error: null }
  | { status: 'notFound'; item: null; error: null }
  | { status: 'ready'; item: FullItem; error: null }
  | { status: 'error'; item: null; error: string };

export interface UseItemResult {
  query: ItemQuery;
  refresh: () => Promise<void>;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loaded'; itemId: string; item: FullItem }
  | { kind: 'missing'; itemId: string }
  | { kind: 'failed'; itemId: string; error: string };

interface ItemWithGroupsRow extends Item {
  item_groups: { group_id: string }[] | null;
}

/** Pure async fetcher — never touches React state directly. Returns a
 *  next-state value the effect/callback can apply. */
async function loadItem(itemId: string, callerId: string): Promise<FetchState> {
  const { data, error } = await supabase
    .from('items')
    .select('*, item_groups(group_id)')
    .eq('id', itemId)
    .maybeSingle<ItemWithGroupsRow>();

  if (error) return { kind: 'failed', itemId, error: error.message };
  if (!data) return { kind: 'missing', itemId };

  const item: FullItem = {
    id: data.id,
    owner_id: data.owner_id,
    title: data.title,
    maker: data.maker,
    url: data.url,
    price_text: data.price_text,
    occasion: data.occasion as Occasion,
    priority: data.priority,
    note: data.note,
    status: data.status as ItemStatus,
    cover_url: data.cover_url,
    created_at: data.created_at,
    updated_at: data.updated_at,
    group_ids: (data.item_groups ?? []).map((g) => g.group_id),
    is_mine: data.owner_id === callerId,
  };
  return { kind: 'loaded', itemId, item };
}

export function useItem(itemId: string | null): UseItemResult {
  const { user, status: authStatus } = useAuth();
  const [fetched, setFetched] = useState<FetchState>({ kind: 'idle' });

  useEffect(() => {
    if (authStatus !== 'authenticated' || !user || !itemId) return undefined;
    const callerId = user.id;
    let cancelled = false;

    void loadItem(itemId, callerId).then((state) => {
      if (!cancelled) setFetched(state);
    });

    return () => {
      cancelled = true;
    };
  }, [authStatus, user, itemId]);

  const query = useMemo<ItemQuery>(() => {
    if (authStatus === 'loading') return { status: 'loading', item: null, error: null };
    if (authStatus === 'anonymous' || !user) {
      return { status: 'anonymous', item: null, error: null };
    }
    if (!itemId) return { status: 'notFound', item: null, error: null };
    if (fetched.kind === 'idle' || fetched.itemId !== itemId) {
      return { status: 'loading', item: null, error: null };
    }
    if (fetched.kind === 'loaded') {
      return { status: 'ready', item: fetched.item, error: null };
    }
    if (fetched.kind === 'missing') {
      return { status: 'notFound', item: null, error: null };
    }
    return { status: 'error', item: null, error: fetched.error };
  }, [authStatus, user, itemId, fetched]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!user || !itemId) return;
    const state = await loadItem(itemId, user.id);
    setFetched(state);
  }, [user, itemId]);

  return { query, refresh };
}
