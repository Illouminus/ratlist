/**
 * `useSantaEvent(id)` — full detail for one Secret Santa event:
 *   - the event row itself
 *   - the list of participants with their basic profile fields
 *   - exclusion pairs (organiser-only via RLS, but visible to all
 *     participants once configured — the list is shown so people see
 *     what constraints the draw will respect)
 *   - the caller's own assignment (if the draw ran)
 *   - all assignments (only if the event is revealed)
 *
 * Plus the mutations a participant or organiser might run:
 *   - join / leave (participant, before draw)
 *   - addExclusion / removeExclusion (organiser, before draw)
 *   - runDraw (organiser, before draw)
 *   - reveal (organiser, after draw)
 *
 * Privacy: the underlying RLS makes most of this self-enforcing — the
 * `santa_assignments` SELECT policy hides others' pairings until reveal,
 * so even if we accidentally over-fetched on the client, the database
 * would still only return rows the caller is allowed to see.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import type { Profile } from '../lib/db';
import type { SantaStatus } from './useSantaEvents';

export interface SantaEvent {
  id: string;
  group_id: string;
  name: string;
  budget_text: string | null;
  gift_date: string | null;
  draw_deadline: string | null;
  status: SantaStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SantaParticipant {
  user_id: string;
  joined_at: string;
  user: Pick<Profile, 'id' | 'display_name' | 'handle' | 'avatar_url'>;
}

export interface SantaAssignmentRow {
  giver_id: string;
  receiver_id: string;
  giver: Pick<Profile, 'id' | 'display_name' | 'handle'>;
  receiver: Pick<Profile, 'id' | 'display_name' | 'handle'>;
}

export interface MyAssignment {
  giver_id: string;
  receiver_id: string;
  receiver: Pick<Profile, 'id' | 'display_name' | 'handle' | 'avatar_url'>;
}

/** A "user_a should not draw user_b" rule, joined with both names. */
export interface SantaExclusion {
  user_a_id: string;
  user_b_id: string;
  user_a: Pick<Profile, 'id' | 'display_name' | 'handle'>;
  user_b: Pick<Profile, 'id' | 'display_name' | 'handle'>;
}

export type SantaDetailQuery =
  | { status: 'loading'; data: null; error: null }
  | { status: 'anonymous'; data: null; error: null }
  | { status: 'error'; data: null; error: string }
  | {
      status: 'ready';
      data: {
        event: SantaEvent;
        participants: SantaParticipant[];
        exclusions: SantaExclusion[];
        myAssignment: MyAssignment | null;
        allAssignments: SantaAssignmentRow[];
      };
      error: null;
    };

export interface UseSantaEventResult {
  query: SantaDetailQuery;
  refresh: () => Promise<void>;
  join: () => Promise<{ ok: true } | { error: string }>;
  leave: () => Promise<{ ok: true } | { error: string }>;
  /**
   * Add a "userA should not draw userB" rule. If `mutual` is true,
   * the reverse rule is added too — the typical case for couples.
   */
  addExclusion: (
    userA: string,
    userB: string,
    mutual: boolean,
  ) => Promise<{ ok: true } | { error: string }>;
  removeExclusion: (userA: string, userB: string) => Promise<{ ok: true } | { error: string }>;
  runDraw: () => Promise<{ ok: true } | { error: string }>;
  reveal: () => Promise<{ ok: true } | { error: string }>;
}

// ─────────────────────────── load ───────────────────────────

interface RawParticipant {
  user_id: string;
  joined_at: string;
  user: Pick<Profile, 'id' | 'display_name' | 'handle' | 'avatar_url'> | null;
}

interface RawAssignment {
  giver_id: string;
  receiver_id: string;
  giver: Pick<Profile, 'id' | 'display_name' | 'handle'> | null;
  receiver: Pick<Profile, 'id' | 'display_name' | 'handle'> | null;
}

interface RawExclusion {
  user_a: string;
  user_b: string;
  profile_a: Pick<Profile, 'id' | 'display_name' | 'handle'> | null;
  profile_b: Pick<Profile, 'id' | 'display_name' | 'handle'> | null;
}

interface LoadedData {
  event: SantaEvent;
  participants: SantaParticipant[];
  exclusions: SantaExclusion[];
  myAssignment: MyAssignment | null;
  allAssignments: SantaAssignmentRow[];
}

async function loadEvent(
  eventId: string,
  userId: string,
): Promise<{ kind: 'ok'; data: LoadedData } | { kind: 'error'; error: string }> {
  const { data: eventRow, error: eventErr } = await supabase
    .from('santa_events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle<SantaEvent>();

  if (eventErr) return { kind: 'error', error: eventErr.message };
  if (!eventRow) return { kind: 'error', error: 'event_not_found' };

  // Four queries in parallel — RLS gates each. `allAssignments` is gated
  // server-side: rows are only returned where giver_id = caller OR the
  // event is revealed, so the same query is safe to run at any status.
  const [participantsRes, exclusionsRes, myAssignRes, allAssignRes] = await Promise.all([
    supabase
      .from('santa_participants')
      .select('user_id, joined_at, user:profiles!santa_participants_user_id_fkey(id, display_name, handle, avatar_url)')
      .eq('event_id', eventId)
      .order('joined_at')
      .returns<RawParticipant[]>(),
    supabase
      .from('santa_exclusions')
      .select(
        'user_a, user_b, ' +
          'profile_a:profiles!santa_exclusions_user_a_fkey(id, display_name, handle), ' +
          'profile_b:profiles!santa_exclusions_user_b_fkey(id, display_name, handle)',
      )
      .eq('event_id', eventId)
      .returns<RawExclusion[]>(),
    supabase
      .from('santa_assignments')
      .select('giver_id, receiver_id, receiver:profiles!santa_assignments_receiver_id_fkey(id, display_name, handle, avatar_url)')
      .eq('event_id', eventId)
      .eq('giver_id', userId)
      .maybeSingle<{
        giver_id: string;
        receiver_id: string;
        receiver: Pick<Profile, 'id' | 'display_name' | 'handle' | 'avatar_url'> | null;
      }>(),
    eventRow.status === 'revealed'
      ? supabase
          .from('santa_assignments')
          .select(
            'giver_id, receiver_id, ' +
              'giver:profiles!santa_assignments_giver_id_fkey(id, display_name, handle), ' +
              'receiver:profiles!santa_assignments_receiver_id_fkey(id, display_name, handle)',
          )
          .eq('event_id', eventId)
          .returns<RawAssignment[]>()
      : Promise.resolve({ data: [] as RawAssignment[], error: null }),
  ]);

  if (participantsRes.error) return { kind: 'error', error: participantsRes.error.message };
  if (exclusionsRes.error) return { kind: 'error', error: exclusionsRes.error.message };
  if (myAssignRes.error) return { kind: 'error', error: myAssignRes.error.message };
  if (allAssignRes.error) return { kind: 'error', error: allAssignRes.error.message };

  const participants: SantaParticipant[] = (participantsRes.data ?? [])
    .filter((p): p is RawParticipant & { user: NonNullable<RawParticipant['user']> } => p.user !== null)
    .map((p) => ({ user_id: p.user_id, joined_at: p.joined_at, user: p.user }));

  const myAssignment: MyAssignment | null =
    myAssignRes.data && myAssignRes.data.receiver
      ? {
          giver_id: myAssignRes.data.giver_id,
          receiver_id: myAssignRes.data.receiver_id,
          receiver: myAssignRes.data.receiver,
        }
      : null;

  const allAssignments: SantaAssignmentRow[] = (allAssignRes.data ?? [])
    .filter(
      (a): a is RawAssignment & { giver: NonNullable<RawAssignment['giver']>; receiver: NonNullable<RawAssignment['receiver']> } =>
        a.giver !== null && a.receiver !== null,
    )
    .map((a) => ({
      giver_id: a.giver_id,
      receiver_id: a.receiver_id,
      giver: a.giver,
      receiver: a.receiver,
    }));

  const exclusions: SantaExclusion[] = (exclusionsRes.data ?? [])
    .filter(
      (e): e is RawExclusion & {
        profile_a: NonNullable<RawExclusion['profile_a']>;
        profile_b: NonNullable<RawExclusion['profile_b']>;
      } => e.profile_a !== null && e.profile_b !== null,
    )
    .map((e) => ({
      user_a_id: e.user_a,
      user_b_id: e.user_b,
      user_a: e.profile_a,
      user_b: e.profile_b,
    }));

  return {
    kind: 'ok',
    data: {
      event: eventRow,
      participants,
      exclusions,
      myAssignment,
      allAssignments,
    },
  };
}

// ─────────────────────────── hook ───────────────────────────

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loaded'; eventId: string; userId: string; data: LoadedData }
  | { kind: 'failed'; eventId: string; userId: string; error: string };

export function useSantaEvent(eventId: string | null): UseSantaEventResult {
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

  const query = useMemo<SantaDetailQuery>(() => {
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

  const join = useCallback(async (): Promise<{ ok: true } | { error: string }> => {
    if (!user || !eventId) return { error: 'not authenticated' };
    const { error } = await supabase
      .from('santa_participants')
      .insert({ event_id: eventId, user_id: user.id });
    if (error) return { error: error.message };
    await reload();
    return { ok: true };
  }, [user, eventId, reload]);

  const leave = useCallback(async (): Promise<{ ok: true } | { error: string }> => {
    if (!user || !eventId) return { error: 'not authenticated' };
    const { error } = await supabase
      .from('santa_participants')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', user.id);
    if (error) return { error: error.message };
    await reload();
    return { ok: true };
  }, [user, eventId, reload]);

  const addExclusion = useCallback(
    async (
      userA: string,
      userB: string,
      mutual: boolean,
    ): Promise<{ ok: true } | { error: string }> => {
      if (!eventId) return { error: 'no event' };
      if (userA === userB) return { error: 'same user' };
      const rows = mutual
        ? [
            { event_id: eventId, user_a: userA, user_b: userB },
            { event_id: eventId, user_a: userB, user_b: userA },
          ]
        : [{ event_id: eventId, user_a: userA, user_b: userB }];
      // Upsert-style: ignore duplicate-key errors so re-adding a mutual
      // pair where one direction already exists doesn't fail the whole call.
      const { error } = await supabase.from('santa_exclusions').upsert(rows, {
        onConflict: 'event_id,user_a,user_b',
        ignoreDuplicates: true,
      });
      if (error) return { error: error.message };
      await reload();
      return { ok: true };
    },
    [eventId, reload],
  );

  const removeExclusion = useCallback(
    async (userA: string, userB: string): Promise<{ ok: true } | { error: string }> => {
      if (!eventId) return { error: 'no event' };
      const { error } = await supabase
        .from('santa_exclusions')
        .delete()
        .eq('event_id', eventId)
        .eq('user_a', userA)
        .eq('user_b', userB);
      if (error) return { error: error.message };
      await reload();
      return { ok: true };
    },
    [eventId, reload],
  );

  const runDraw = useCallback(async (): Promise<{ ok: true } | { error: string }> => {
    if (!eventId) return { error: 'no event' };
    const { error } = await supabase.rpc('run_santa_draw', { _event_id: eventId });
    if (error) return { error: error.message };
    await reload();
    // Fire transactional emails to each giver. Strictly best-effort —
    // a failed invoke (Edge function down, env not configured, etc.)
    // must not roll back the draw itself, so this is intentionally
    // not awaited and any error is only logged. The organiser will
    // still see the draw result in the UI either way.
    void supabase.functions
      .invoke('send-santa-draw', { body: { event_id: eventId } })
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          console.warn('[santa] send-santa-draw invoke failed', err);
        }
      });
    return { ok: true };
  }, [eventId, reload]);

  const reveal = useCallback(async (): Promise<{ ok: true } | { error: string }> => {
    if (!eventId) return { error: 'no event' };
    const { error } = await supabase.rpc('reveal_santa_event', { _event_id: eventId });
    if (error) return { error: error.message };
    await reload();
    return { ok: true };
  }, [eventId, reload]);

  return {
    query,
    refresh: reload,
    join,
    leave,
    addExclusion,
    removeExclusion,
    runDraw,
    reveal,
  };
}
