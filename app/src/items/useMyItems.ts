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
import { track } from '../lib/plausible';
import type { Item, Occasion, ItemStatus } from '../lib/db';
import type { Visibility } from '../components/VisibilitySelector';

/** An item plus the list of groups it's published to and events it's
 * curated into. Both arrays are full snapshots — the form treats them
 * as the source of truth for publishing on submit. */
export interface MyItem extends Item {
  group_ids: string[];
  event_ids: string[];
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
  /**
   * 2-state visibility: 'shared' (friends in-app + anyone with the share
   * link) or 'private' (owner only). Defaults to 'shared' both here and at
   * the DB, so omitting it is safe but explicit wins.
   */
  visibility?: Visibility;
  /**
   * Freeform category string (e.g. "Кухня", "Books") or null for
   * "uncategorised". Used by `<CategoryChips>` for client-side filter
   * on the list screens.
   */
  category?: string | null;
  /**
   * IDs of groups to publish the item to. Empty = no group write.
   *
   * Kept on the type for backwards compatibility with the legacy
   * circles UI, but the add/edit form no longer surfaces it — PR 2
   * dropped the multi-select picker. PR 3 will sweep `item_groups`
   * entirely; until then this field is ignored on the form path
   * (passed as `[]`) and reads still use `visibility` exclusively.
   */
  group_ids: string[];
  /** IDs of own events to curate this item into. Empty = no event. */
  event_ids?: string[];
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
  /**
   * Change an item's priority level. Optimistically updates the local
   * cache, then issues the UPDATE. Reverts the cache on server error.
   */
  updateItemPriority: (itemId: string, priority: 1 | 2 | 3) => Promise<{ ok: true } | { error: string }>;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loaded'; userId: string; items: MyItem[] }
  | { kind: 'failed'; userId: string; error: string };

interface ItemWithRelationsRow extends Item {
  item_groups: { group_id: string }[] | null;
  event_items: { event_id: string }[] | null;
}

/** Pure async fetcher — never touches React state directly. */
async function loadItems(userId: string): Promise<FetchState> {
  const { data, error } = await supabase
    .from('items')
    .select('*, item_groups(group_id), event_items(event_id)')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .returns<ItemWithRelationsRow[]>();

  if (error) return { kind: 'failed', userId, error: error.message };

  const items: MyItem[] = (data ?? []).map((row) => ({
    ...row,
    group_ids: (row.item_groups ?? []).map((g) => g.group_id),
    event_ids: (row.event_items ?? []).map((e) => e.event_id),
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
          visibility: input.visibility ?? 'shared',
          category: input.category ?? null,
        })
        .select('*')
        .single();

      if (error || !data) return { error: error?.message ?? 'unknown error' };

      // Fire the goal immediately after the items insert succeeds, not
      // after the publish step — if pub fails the item still exists in
      // the user's list and from the user's perspective they added it.
      track('ItemAdded');

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

      // Attach to events the owner picked. Same fire-after-insert pattern
      // as publishing — if it fails the item still exists and the owner
      // can attach manually from the event detail page.
      if (input.event_ids && input.event_ids.length > 0) {
        const rows = input.event_ids.map((eid) => ({ event_id: eid, item_id: data.id }));
        const { error: attachError } = await supabase.from('event_items').insert(rows);
        if (attachError) return { error: attachError.message };
      }

      const state = await loadItems(user.id);
      setFetched(state);
      // The freshly-loaded list is the source of truth.
      const created = state.kind === 'loaded' ? state.items.find((i) => i.id === data.id) : undefined;
      return {
        item:
          created ?? {
            ...data,
            group_ids: input.group_ids,
            event_ids: input.event_ids ?? [],
          },
      };
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
          visibility: input.visibility ?? 'shared',
          category: input.category ?? null,
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

      // Same drop-and-replace dance for event curation. RLS only allows
      // delete/insert by the honoree on their own event_items rows, so a
      // user trying to attach someone else's item would be rejected.
      if (input.event_ids !== undefined) {
        const { error: delEvErr } = await supabase
          .from('event_items')
          .delete()
          .eq('item_id', id);
        if (delEvErr) return { error: delEvErr.message };
        if (input.event_ids.length > 0) {
          const rows = input.event_ids.map((eid) => ({ event_id: eid, item_id: id }));
          const { error: insEvErr } = await supabase.from('event_items').insert(rows);
          if (insEvErr) return { error: insEvErr.message };
        }
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

  const updateItemPriority = useCallback(
    async (itemId: string, priority: 1 | 2 | 3): Promise<{ ok: true } | { error: string }> => {
      // Snapshot the prior priority from the current closure state BEFORE the
      // optimistic update. React batches setState updaters and they don't run
      // synchronously, so a side-effect-in-updater would still be null when
      // the await resolves — read from `fetched` directly instead.
      const priorPriority =
        fetched.kind === 'loaded'
          ? (fetched.items.find((i) => i.id === itemId)?.priority ?? null)
          : null;

      // Optimistic update: flip the local state immediately.
      setFetched((prev) => {
        if (prev.kind !== 'loaded') return prev;
        const items = prev.items.map((i) =>
          i.id === itemId ? { ...i, priority } : i,
        );
        return { ...prev, items };
      });

      const { error } = await supabase
        .from('items')
        .update({ priority })
        .eq('id', itemId);

      if (error) {
        // Revert the optimistic change.
        if (priorPriority !== null) {
          const snapshot = priorPriority;
          setFetched((prev) => {
            if (prev.kind !== 'loaded') return prev;
            const items = prev.items.map((i) =>
              i.id === itemId ? { ...i, priority: snapshot } : i,
            );
            return { ...prev, items };
          });
        }
        return { error: error.message };
      }

      track('ItemPriorityChanged', { from: priorPriority ?? 'unknown', to: priority });
      return { ok: true };
    },
    // `fetched` is required to read the prior priority synchronously. The
    // callback identity changing on every state update is fine — MyListScreen
    // uses it inline in the JSX, not as a memoization key.
    [fetched],
  );

  return { query, refresh, createItem, updateItem, deleteItem, updateStatus, updateItemPriority };
}
