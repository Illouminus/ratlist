/**
 * `useEvent(id)` — full detail for one event:
 *   - the event row itself
 *   - the audience: the circles (groups) it's open to
 *   - the curated items, each joined with its full `items` row + cover
 *   - whether the caller is the honoree
 *
 * Plus the mutations the honoree might run (everything is RLS-gated so
 * non-honorees get a permission error if they try):
 *   - update / delete the event
 *   - attach / detach an audience circle
 *   - attach / detach an item to the curation
 *
 * Visibility note: the honoree always sees their own items, audience
 * members see only items also visible to them through the existing item
 * RLS (`item_groups` → `group_members`). The DB does the filtering; the
 * client just renders what comes back.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import type { Event, Group, Item, Profile } from '../lib/db';

export interface EventAudienceCircle {
  group_id: string;
  group: Pick<Group, 'id' | 'name' | 'emoji'>;
}

export interface EventClaim {
  id: string;
  item_id: string;
  user_id: string;
  user: Pick<Profile, 'id' | 'display_name' | 'handle' | 'avatar_url'>;
}

export interface EventCuratedItem {
  item_id: string;
  position: number | null;
  added_at: string;
  item: Item;
  /** Claims visible to the current viewer. Honoree always sees [] for own
   * items (RLS gate); guests see every claim on items they can see. */
  claims: EventClaim[];
}

/**
 * The raw `Event` row enriched with the joined honoree profile. The join
 * is a left-join on `profiles.id = events.honoree_id`; when `honoree_id`
 * is null (HR-mode with a non-user honoree) the `honoree` field is null.
 */
export type EventWithHonoree = Event & {
  honoree: Pick<Profile, 'id' | 'display_name' | 'handle' | 'avatar_url'> | null;
};

export type EventDetailQuery =
  | { status: 'loading'; data: null; error: null }
  | { status: 'anonymous'; data: null; error: null }
  | { status: 'error'; data: null; error: string }
  | {
      status: 'ready';
      data: {
        event: EventWithHonoree;
        audience: EventAudienceCircle[];
        items: EventCuratedItem[];
        /** Caller is the registered user set as honoree (may be false in HR-mode
         *  when honoree is a non-user person identified only by `honoree_name`). */
        isHonoree: boolean;
        /** Caller is the creator (`created_by`) — gates edit/delete affordances
         *  in HR-mode where the creator manages the event, not the honoree. */
        isCreator: boolean;
      };
      error: null;
    };

export interface UpdateEventDetailInput {
  title?: string;
  kind?: Event['kind'];
  occurs_on?: string | null;
  note?: string | null;
  /** HR-mode: update the linked user honoree (null clears it). */
  honoree_id?: string | null;
  /** HR-mode: update the text fallback name (null clears it). */
  honoree_name?: string | null;
}

export interface UseEventResult {
  query: EventDetailQuery;
  refresh: () => Promise<void>;
  update: (input: UpdateEventDetailInput) => Promise<{ ok: true } | { error: string }>;
  remove: () => Promise<{ ok: true } | { error: string }>;
  attachCircle: (groupId: string) => Promise<{ ok: true } | { error: string }>;
  detachCircle: (groupId: string) => Promise<{ ok: true } | { error: string }>;
  attachItem: (itemId: string) => Promise<{ ok: true } | { error: string }>;
  detachItem: (itemId: string) => Promise<{ ok: true } | { error: string }>;
  /** Guest action: claim a curated item. RLS rejects if the caller owns
   * the item (can't claim your own) or can't see it. */
  claim: (itemId: string) => Promise<{ ok: true } | { error: string }>;
  release: (itemId: string) => Promise<{ ok: true } | { error: string }>;
}

// ─────────────────────────── load ───────────────────────────

interface RawAudienceRow {
  group_id: string;
  group: Pick<Group, 'id' | 'name' | 'emoji'> | null;
}

interface RawCuratedItemRow {
  item_id: string;
  position: number | null;
  added_at: string;
  item: Item | null;
}

interface RawClaimRow {
  id: string;
  item_id: string;
  user_id: string;
  user: Pick<Profile, 'id' | 'display_name' | 'handle' | 'avatar_url'> | null;
}

interface LoadedData {
  event: EventWithHonoree;
  audience: EventAudienceCircle[];
  items: EventCuratedItem[];
  isHonoree: boolean;
  isCreator: boolean;
}

async function loadEvent(
  eventId: string,
  userId: string,
): Promise<{ kind: 'ok'; data: LoadedData } | { kind: 'error'; error: string }> {
  const { data: eventRow, error: eventErr } = await supabase
    .from('events')
    .select('*, honoree:profiles(id, display_name, handle, avatar_url)')
    .eq('id', eventId)
    .maybeSingle<EventWithHonoree>();

  if (eventErr) return { kind: 'error', error: eventErr.message };
  if (!eventRow) return { kind: 'error', error: 'event_not_found' };

  // Audience + items in parallel — both are RLS-gated, so anything we
  // get back is something the caller is allowed to see.
  const [audienceRes, itemsRes] = await Promise.all([
    supabase
      .from('event_circles')
      .select('group_id, group:groups(id, name, emoji)')
      .eq('event_id', eventId)
      .returns<RawAudienceRow[]>(),
    supabase
      .from('event_items')
      .select('item_id, position, added_at, item:items(*)')
      .eq('event_id', eventId)
      .order('position', { ascending: false, nullsFirst: false })
      .order('added_at', { ascending: true })
      .returns<RawCuratedItemRow[]>(),
  ]);

  if (audienceRes.error) return { kind: 'error', error: audienceRes.error.message };
  if (itemsRes.error) return { kind: 'error', error: itemsRes.error.message };

  const audience: EventAudienceCircle[] = (audienceRes.data ?? [])
    .filter((a): a is RawAudienceRow & { group: NonNullable<RawAudienceRow['group']> } => a.group !== null)
    .map((a) => ({ group_id: a.group_id, group: a.group }));

  const curatedRows = (itemsRes.data ?? []).filter(
    (it): it is RawCuratedItemRow & { item: NonNullable<RawCuratedItemRow['item']> } =>
      it.item !== null,
  );

  // Pull claims for the curated items in one round-trip. RLS hides
  // claims from the item-owner automatically — when the caller is the
  // honoree they'll get [] back even though some items may actually be
  // claimed by friends. That's the whole point: honoree must not learn
  // who's getting what.
  const itemIds = curatedRows.map((r) => r.item_id);
  const claimsRes =
    itemIds.length === 0
      ? { data: [] as RawClaimRow[], error: null }
      : await supabase
          .from('claims')
          .select('id, item_id, user_id, user:profiles(id, display_name, handle, avatar_url)')
          .in('item_id', itemIds)
          .returns<RawClaimRow[]>();

  if (claimsRes.error) return { kind: 'error', error: claimsRes.error.message };

  const claimsByItem = new Map<string, EventClaim[]>();
  for (const c of claimsRes.data ?? []) {
    if (!c.user) continue;
    const list = claimsByItem.get(c.item_id) ?? [];
    list.push({ id: c.id, item_id: c.item_id, user_id: c.user_id, user: c.user });
    claimsByItem.set(c.item_id, list);
  }

  const items: EventCuratedItem[] = curatedRows.map((it) => ({
    item_id: it.item_id,
    position: it.position,
    added_at: it.added_at,
    item: it.item,
    claims: claimsByItem.get(it.item_id) ?? [],
  }));

  return {
    kind: 'ok',
    data: {
      event: eventRow,
      audience,
      items,
      // honoree_id is nullable in HR-mode — only true when the caller is
      // the registered user set as honoree.
      isHonoree: eventRow.honoree_id === userId,
      // created_by is always set; gates edit/delete in HR-mode.
      isCreator: eventRow.created_by === userId,
    },
  };
}

// ─────────────────────────── hook ───────────────────────────

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loaded'; eventId: string; userId: string; data: LoadedData }
  | { kind: 'failed'; eventId: string; userId: string; error: string };

export function useEvent(eventId: string | null): UseEventResult {
  const { user, status: authStatus } = useAuth();
  const [fetched, setFetched] = useState<FetchState>({ kind: 'idle' });

  useEffect(() => {
    if (authStatus !== 'authenticated' || !user || !eventId) return undefined;
    const uid = user.id;
    let cancelled = false;

    void loadEvent(eventId, uid).then((result) => {
      if (cancelled) return;
      if (result.kind === 'ok') {
        setFetched({ kind: 'loaded', eventId, userId: uid, data: result.data });
      } else {
        setFetched({ kind: 'failed', eventId, userId: uid, error: result.error });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [authStatus, user, eventId]);

  const query = useMemo<EventDetailQuery>(() => {
    if (authStatus === 'loading') return { status: 'loading', data: null, error: null };
    if (authStatus === 'anonymous' || !user) {
      return { status: 'anonymous', data: null, error: null };
    }
    if (!eventId) return { status: 'error', data: null, error: 'no event id' };
    if (fetched.kind === 'idle' || fetched.eventId !== eventId || fetched.userId !== user.id) {
      return { status: 'loading', data: null, error: null };
    }
    if (fetched.kind === 'loaded') {
      return { status: 'ready', data: fetched.data, error: null };
    }
    return { status: 'error', data: null, error: fetched.error };
  }, [authStatus, user, eventId, fetched]);

  const reload = useCallback(async () => {
    if (!user || !eventId) return;
    const result = await loadEvent(eventId, user.id);
    if (result.kind === 'ok') {
      setFetched({ kind: 'loaded', eventId, userId: user.id, data: result.data });
    } else {
      setFetched({ kind: 'failed', eventId, userId: user.id, error: result.error });
    }
  }, [user, eventId]);

  const update = useCallback(
    async (input: UpdateEventDetailInput): Promise<{ ok: true } | { error: string }> => {
      if (!eventId) return { error: 'no event' };
      const patch: UpdateEventDetailInput = {};
      if (input.title !== undefined) patch.title = input.title.trim();
      if (input.kind !== undefined) patch.kind = input.kind;
      if (input.occurs_on !== undefined) patch.occurs_on = input.occurs_on;
      if (input.note !== undefined) patch.note = input.note?.trim() || null;
      if (input.honoree_id !== undefined) patch.honoree_id = input.honoree_id;
      if (input.honoree_name !== undefined) patch.honoree_name = input.honoree_name;
      if (Object.keys(patch).length === 0) return { ok: true };

      const { error } = await supabase.from('events').update(patch).eq('id', eventId);
      if (error) return { error: error.message };
      await reload();
      return { ok: true };
    },
    [eventId, reload],
  );

  const remove = useCallback(async (): Promise<{ ok: true } | { error: string }> => {
    if (!eventId) return { error: 'no event' };
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) return { error: error.message };
    return { ok: true };
  }, [eventId]);

  const attachCircle = useCallback(
    async (groupId: string): Promise<{ ok: true } | { error: string }> => {
      if (!eventId) return { error: 'no event' };
      const { error } = await supabase
        .from('event_circles')
        .insert({ event_id: eventId, group_id: groupId });
      if (error) return { error: error.message };
      await reload();
      return { ok: true };
    },
    [eventId, reload],
  );

  const detachCircle = useCallback(
    async (groupId: string): Promise<{ ok: true } | { error: string }> => {
      if (!eventId) return { error: 'no event' };
      const { error } = await supabase
        .from('event_circles')
        .delete()
        .eq('event_id', eventId)
        .eq('group_id', groupId);
      if (error) return { error: error.message };
      await reload();
      return { ok: true };
    },
    [eventId, reload],
  );

  const attachItem = useCallback(
    async (itemId: string): Promise<{ ok: true } | { error: string }> => {
      if (!eventId) return { error: 'no event' };
      const { error } = await supabase
        .from('event_items')
        .insert({ event_id: eventId, item_id: itemId });
      if (error) return { error: error.message };
      await reload();
      return { ok: true };
    },
    [eventId, reload],
  );

  const detachItem = useCallback(
    async (itemId: string): Promise<{ ok: true } | { error: string }> => {
      if (!eventId) return { error: 'no event' };
      const { error } = await supabase
        .from('event_items')
        .delete()
        .eq('event_id', eventId)
        .eq('item_id', itemId);
      if (error) return { error: error.message };
      await reload();
      return { ok: true };
    },
    [eventId, reload],
  );

  const claim = useCallback(
    async (itemId: string): Promise<{ ok: true } | { error: string }> => {
      if (!user) return { error: 'not authenticated' };
      const { error } = await supabase
        .from('claims')
        .insert({ item_id: itemId, user_id: user.id });
      if (error) return { error: error.message };
      await reload();
      return { ok: true };
    },
    [user, reload],
  );

  const release = useCallback(
    async (itemId: string): Promise<{ ok: true } | { error: string }> => {
      if (!user) return { error: 'not authenticated' };
      const { error } = await supabase
        .from('claims')
        .delete()
        .eq('item_id', itemId)
        .eq('user_id', user.id);
      if (error) return { error: error.message };
      await reload();
      return { ok: true };
    },
    [user, reload],
  );

  return {
    query,
    refresh: reload,
    update,
    remove,
    attachCircle,
    detachCircle,
    attachItem,
    detachItem,
    claim,
    release,
  };
}
