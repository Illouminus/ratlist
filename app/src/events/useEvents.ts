/**
 * `useEvents` — list of events visible to the caller + create / update /
 * delete an event. Backed by the `get_my_events` RPC which already
 * attaches honoree profile fields, item count, audience-circle count and
 * `is_honoree` in one round-trip.
 *
 * Same shape as `useGroups` / `useSantaEvents` — async fetch is a pure
 * function, the effect only setStates from inside `.then(...)` so the
 * `react-hooks/set-state-in-effect` lint rule stays happy.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { debounce } from '../lib/debounce';
import type { EventKind } from '../lib/db';

/** An event row enriched with honoree info + counts. */
export interface MyEvent {
  id: string;
  created_by: string;                  // uuid of whoever created the event
  honoree_id: string | null;           // null for non-user honorees (HR-mode)
  honoree_name: string | null;         // text fallback when honoree_id is null
  honoree_display_name: string | null; // from profiles join — null for non-user honorees
  honoree_handle: string | null;       // from profiles join — null for non-user honorees
  honoree_avatar_url: string | null;
  title: string;
  kind: EventKind;
  occurs_on: string | null; // ISO date (YYYY-MM-DD)
  note: string | null;
  created_at: string;
  updated_at: string;
  item_count: number;
  audience_circle_count: number;
  is_honoree: boolean;
  is_creator: boolean; // caller is the created_by user
}

/**
 * Resolves the honoree's display name from either the joined profile (user
 * honoree) or the text fallback (non-user honoree in HR-mode).
 * Returns '(no name)' as last resort.
 */
export function honoreeDisplayName(
  e: Pick<MyEvent, 'honoree_display_name' | 'honoree_name'>,
): string {
  return e.honoree_display_name ?? e.honoree_name ?? '(no name)';
}

export type EventsQuery =
  | { status: 'loading'; events: null; error: null }
  | { status: 'anonymous'; events: null; error: null }
  | { status: 'ready'; events: MyEvent[]; error: null }
  | { status: 'error'; events: null; error: string };

export interface CreateEventInput {
  title: string;
  kind: EventKind;
  occurs_on?: string | null;
  note?: string | null;
  /**
   * HR-mode: explicit honoree user id.  When omitted (or null), the
   * caller is used as the honoree (self-event, legacy behaviour).
   * Pass null together with `honoree_name` for a non-user honoree.
   */
  honoree_id?: string | null;
  /**
   * HR-mode: free-text name for a non-user honoree.  Only meaningful
   * when `honoree_id` is null.
   */
  honoree_name?: string | null;
  /** Initial audience — array of group ids the honoree belongs to. */
  circle_ids?: string[];
  /** Initial item curation — array of item ids the honoree owns. */
  item_ids?: string[];
}

export interface UpdateEventInput {
  title?: string;
  kind?: EventKind;
  occurs_on?: string | null;
  note?: string | null;
}

export interface UseEventsResult {
  query: EventsQuery;
  refresh: () => Promise<void>;
  createEvent: (input: CreateEventInput) => Promise<{ event: MyEvent } | { error: string }>;
  updateEvent: (eventId: string, input: UpdateEventInput) => Promise<{ ok: true } | { error: string }>;
  deleteEvent: (eventId: string) => Promise<{ ok: true } | { error: string }>;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loaded'; userId: string; events: MyEvent[] }
  | { kind: 'failed'; userId: string; error: string };

async function loadEvents(userId: string): Promise<FetchState> {
  const { data, error } = await supabase.rpc('get_my_events');
  if (error) return { kind: 'failed', userId, error: error.message };
  return { kind: 'loaded', userId, events: (data ?? []) as MyEvent[] };
}

export function useEvents(): UseEventsResult {
  const { user, status: authStatus } = useAuth();
  const [fetched, setFetched] = useState<FetchState>({ kind: 'idle' });

  useEffect(() => {
    if (authStatus !== 'authenticated' || !user) return undefined;
    const userId = user.id;
    let cancelled = false;

    void loadEvents(userId).then((state) => {
      if (!cancelled) setFetched(state);
    });

    return () => {
      cancelled = true;
    };
  }, [authStatus, user]);

  const query = useMemo<EventsQuery>(() => {
    if (authStatus === 'loading') return { status: 'loading', events: null, error: null };
    if (authStatus === 'anonymous' || !user) {
      return { status: 'anonymous', events: null, error: null };
    }
    if (fetched.kind === 'idle' || fetched.userId !== user.id) {
      return { status: 'loading', events: null, error: null };
    }
    if (fetched.kind === 'loaded') {
      return { status: 'ready', events: fetched.events, error: null };
    }
    return { status: 'error', events: null, error: fetched.error };
  }, [authStatus, user, fetched]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!user) return;
    const state = await loadEvents(user.id);
    setFetched(state);
  }, [user]);

  // Realtime: re-fetch when any event row, audience link, or curation
  // link changes. The RPC re-filters by visibility — much simpler than
  // patching the local list. A single user edit can fire 3-5 burst
  // writes across these three tables; the 300 ms debounce collapses
  // those into one RPC. Server-side `filter:` isn't viable because
  // guest-event visibility is correlated through dynamic group
  // membership (event_circles → group_members).
  useEffect(() => {
    if (authStatus !== 'authenticated' || !user) return undefined;

    const trigger = debounce(() => {
      void refresh();
    }, 300);

    const channel = supabase
      .channel(`my-events:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_circles' }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_items' }, trigger)
      .subscribe();

    return () => {
      trigger.cancel();
      void supabase.removeChannel(channel);
    };
  }, [authStatus, user, refresh]);

  const createEvent = useCallback(
    async (input: CreateEventInput): Promise<{ event: MyEvent } | { error: string }> => {
      if (!user) return { error: 'not authenticated' };

      // Insert the event itself, capture the id, then attach circles +
      // items in two more round-trips. Not a transaction — if either
      // attach fails the event still exists, and the honoree can edit
      // it from the detail screen. Keeping this client-side for v1 to
      // avoid a Postgres function; revisit if partial-success rates are
      // visible in Sentry.
      // Resolve honoree: when caller passes honoree_id (HR-mode) use
      // it (may be null for a free-text-only honoree); otherwise
      // default to the current user (self-event, original behaviour).
      const honoreeId: string | null =
        input.honoree_id !== undefined ? (input.honoree_id ?? null) : user.id;
      const honoreeName: string | null =
        input.honoree_name?.trim() || null;

      const { data: inserted, error: insertErr } = await supabase
        .from('events')
        .insert({
          honoree_id: honoreeId ?? null,
          honoree_name: honoreeName,
          title: input.title.trim(),
          kind: input.kind,
          occurs_on: input.occurs_on ?? null,
          note: input.note?.trim() || null,
        })
        .select('id')
        .single();

      if (insertErr || !inserted) {
        return { error: insertErr?.message ?? 'unknown error' };
      }

      const eventId = inserted.id;

      if (input.circle_ids && input.circle_ids.length > 0) {
        const rows = input.circle_ids.map((group_id) => ({ event_id: eventId, group_id }));
        const { error } = await supabase.from('event_circles').insert(rows);
        if (error) return { error: error.message };
      }

      if (input.item_ids && input.item_ids.length > 0) {
        const rows = input.item_ids.map((item_id) => ({ event_id: eventId, item_id }));
        const { error } = await supabase.from('event_items').insert(rows);
        if (error) return { error: error.message };
      }

      const state = await loadEvents(user.id);
      setFetched(state);
      const created =
        state.kind === 'loaded' ? state.events.find((e) => e.id === eventId) : undefined;
      if (!created) return { error: 'failed to reload event' };
      return { event: created };
    },
    [user],
  );

  const updateEvent = useCallback(
    async (
      eventId: string,
      input: UpdateEventInput,
    ): Promise<{ ok: true } | { error: string }> => {
      if (!user) return { error: 'not authenticated' };

      const patch: UpdateEventInput = {};
      if (input.title !== undefined) patch.title = input.title.trim();
      if (input.kind !== undefined) patch.kind = input.kind;
      if (input.occurs_on !== undefined) patch.occurs_on = input.occurs_on;
      if (input.note !== undefined) patch.note = input.note?.trim() || null;

      if (Object.keys(patch).length === 0) return { ok: true };

      const { error } = await supabase.from('events').update(patch).eq('id', eventId);
      if (error) return { error: error.message };

      const state = await loadEvents(user.id);
      setFetched(state);
      return { ok: true };
    },
    [user],
  );

  const deleteEvent = useCallback(
    async (eventId: string): Promise<{ ok: true } | { error: string }> => {
      if (!user) return { error: 'not authenticated' };
      const { error } = await supabase.from('events').delete().eq('id', eventId);
      if (error) return { error: error.message };
      const state = await loadEvents(user.id);
      setFetched(state);
      return { ok: true };
    },
    [user],
  );

  return { query, refresh, createEvent, updateEvent, deleteEvent };
}
