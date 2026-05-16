/**
 * `useMyItems` — read/create/delete items owned by the current user.
 *
 * Each returned item carries the IDs of the groups it's published to —
 * fetched via a single PostgREST embed so the JS layer doesn't have to
 * join tables. Mutations (create / delete) re-fetch the list on success
 * so the UI stays consistent without us tracking optimistic state.
 *
 * Same async-only setState pattern as the other hooks in this codebase:
 * pure free fetcher + `.then()` callback in the effect.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import type { Item, Occasion, ItemStatus } from '../lib/db';

/** An item plus the list of groups it's published to. */
export interface MyItem extends Item {
  group_ids: string[];
}

export type ItemsQuery =
  | { status: 'loading'; items: null; error: null }
  | { status: 'anonymous'; items: null; error: null }
  | { status: 'ready'; items: MyItem[]; error: null }
  | { status: 'error'; items: null; error: string };

export interface CreateItemInput {
  title: string;
  maker?: string | null;
  url?: string | null;
  price_text?: string | null;
  occasion: Occasion;
  note?: string | null;
  priority?: 1 | 2 | 3;
  /** Public URL of the uploaded cover image, or null for the placeholder. */
  cover_url?: string | null;
  /** IDs of groups to publish the item to. Empty = private to owner. */
  group_ids: string[];
}

export interface UseMyItemsResult {
  query: ItemsQuery;
  refresh: () => Promise<void>;
  createItem: (input: CreateItemInput) => Promise<{ item: MyItem } | { error: string }>;
  /**
   * Replace an existing item's editable fields AND the full set of groups it
   * is published to. group_ids is treated as a full replacement, not a diff
   * — pass every group the item should be visible in.
   */
  updateItem: (id: string, input: CreateItemInput) => Promise<{ item: MyItem } | { error: string }>;
  deleteItem: (itemId: string) => Promise<{ ok: true } | { error: string }>;
  updateStatus: (itemId: string, status: ItemStatus) => Promise<{ ok: true } | { error: string }>;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loaded'; userId: string; items: MyItem[] }
  | { kind: 'failed'; userId: string; error: string };

interface ItemWithGroupsRow extends Item {
  item_groups: { group_id: string }[] | null;
}

/** Pure async fetcher — never touches React state directly. */
async function loadItems(userId: string): Promise<FetchState> {
  const { data, error } = await supabase
    .from('items')
    .select('*, item_groups(group_id)')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .returns<ItemWithGroupsRow[]>();

  if (error) return { kind: 'failed', userId, error: error.message };

  const items: MyItem[] = (data ?? []).map((row) => ({
    ...row,
    group_ids: (row.item_groups ?? []).map((g) => g.group_id),
  }));

  return { kind: 'loaded', userId, items };
}

export function useMyItems(): UseMyItemsResult {
  const { user, status: authStatus } = useAuth();
  const [fetched, setFetched] = useState<FetchState>({ kind: 'idle' });

  useEffect(() => {
    if (authStatus !== 'authenticated' || !user) return undefined;
    const userId = user.id;
    let cancelled = false;

    void loadItems(userId).then((state) => {
      if (!cancelled) setFetched(state);
    });

    return () => {
      cancelled = true;
    };
  }, [authStatus, user]);

  const query = useMemo<ItemsQuery>(() => {
    if (authStatus === 'loading') return { status: 'loading', items: null, error: null };
    if (authStatus === 'anonymous' || !user) {
      return { status: 'anonymous', items: null, error: null };
    }
    if (fetched.kind === 'idle' || fetched.userId !== user.id) {
      return { status: 'loading', items: null, error: null };
    }
    if (fetched.kind === 'loaded') {
      return { status: 'ready', items: fetched.items, error: null };
    }
    return { status: 'error', items: null, error: fetched.error };
  }, [authStatus, user, fetched]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!user) return;
    const state = await loadItems(user.id);
    setFetched(state);
  }, [user]);

  // Realtime: subscribe to any change to the caller's own items, and
  // any change to item_groups (publishing / un-publishing). Each event
  // is debounced into a single refresh — cheaper than reconciling row
  // patches client-side, and the round-trip is small (<1KB per item).
  useEffect(() => {
    if (authStatus !== 'authenticated' || !user) return undefined;
    const userId = user.id;

    const channel = supabase
      .channel(`my-items:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'items',
          // RLS on items.SELECT already restricts what reaches us, but
          // narrowing here saves traffic for items we wouldn't display
          // on this screen anyway (the My List is owner-only).
          filter: `owner_id=eq.${userId}`,
        },
        () => {
          void refresh();
        },
      )
      .on(
        'postgres_changes',
        // item_groups changes are visible whenever the caller can see
        // the items row — there's no easy server-side filter for "rows
        // owned by me", so we accept all events and let refresh()
        // dedupe via the next loadItems() call.
        { event: '*', schema: 'public', table: 'item_groups' },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authStatus, user, refresh]);

  const createItem = useCallback(
    async (input: CreateItemInput): Promise<{ item: MyItem } | { error: string }> => {
      if (!user) return { error: 'not authenticated' };

      const { data, error } = await supabase
        .from('items')
        .insert({
          owner_id: user.id,
          title: input.title,
          maker: input.maker ?? null,
          url: input.url ?? null,
          price_text: input.price_text ?? null,
          occasion: input.occasion,
          note: input.note ?? null,
          priority: input.priority ?? 2,
          cover_url: input.cover_url ?? null,
        })
        .select('*')
        .single();

      if (error || !data) return { error: error?.message ?? 'unknown error' };

      // Publish to groups in a separate batch insert. If the user picked
      // no groups, the item is private — owner-only.
      if (input.group_ids.length > 0) {
        const rows = input.group_ids.map((gid) => ({ item_id: data.id, group_id: gid }));
        const { error: pubError } = await supabase.from('item_groups').insert(rows);
        if (pubError) {
          // Item exists but failed to publish. Surface the error; the
          // owner will see the item in their list and can re-publish.
          return { error: pubError.message };
        }
      }

      const state = await loadItems(user.id);
      setFetched(state);
      // The freshly-loaded list is the source of truth.
      const created = state.kind === 'loaded' ? state.items.find((i) => i.id === data.id) : undefined;
      return { item: created ?? { ...data, group_ids: input.group_ids } };
    },
    [user],
  );

  const updateItem = useCallback(
    async (
      id: string,
      input: CreateItemInput,
    ): Promise<{ item: MyItem } | { error: string }> => {
      if (!user) return { error: 'not authenticated' };

      const { error: updateError } = await supabase
        .from('items')
        .update({
          title: input.title,
          maker: input.maker ?? null,
          url: input.url ?? null,
          price_text: input.price_text ?? null,
          occasion: input.occasion,
          note: input.note ?? null,
          priority: input.priority ?? 2,
          cover_url: input.cover_url ?? null,
        })
        .eq('id', id);

      if (updateError) return { error: updateError.message };

      // Re-sync group memberships: drop all and re-insert. For small N
      // (a handful of groups per item) the overhead is negligible and the
      // logic is much simpler than computing a diff.
      const { error: delError } = await supabase
        .from('item_groups')
        .delete()
        .eq('item_id', id);
      if (delError) return { error: delError.message };

      if (input.group_ids.length > 0) {
        const rows = input.group_ids.map((gid) => ({ item_id: id, group_id: gid }));
        const { error: insError } = await supabase.from('item_groups').insert(rows);
        if (insError) return { error: insError.message };
      }

      const state = await loadItems(user.id);
      setFetched(state);
      const updated = state.kind === 'loaded' ? state.items.find((i) => i.id === id) : undefined;
      if (!updated) return { error: 'failed to reload item' };
      return { item: updated };
    },
    [user],
  );

  const deleteItem = useCallback(
    async (itemId: string): Promise<{ ok: true } | { error: string }> => {
      if (!user) return { error: 'not authenticated' };
      const { error } = await supabase.from('items').delete().eq('id', itemId);
      if (error) return { error: error.message };
      const state = await loadItems(user.id);
      setFetched(state);
      return { ok: true };
    },
    [user],
  );

  const updateStatus = useCallback(
    async (itemId: string, status: ItemStatus): Promise<{ ok: true } | { error: string }> => {
      if (!user) return { error: 'not authenticated' };
      const { error } = await supabase.from('items').update({ status }).eq('id', itemId);
      if (error) return { error: error.message };
      const state = await loadItems(user.id);
      setFetched(state);
      return { ok: true };
    },
    [user],
  );

  return { query, refresh, createItem, updateItem, deleteItem, updateStatus };
}
