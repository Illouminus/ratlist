/**
 * `useEventParticipants(eventId)` — list of participants for an event,
 * with their status and display info.
 *
 * Used by the coordinator section on EventDetailScreen. RLS gates:
 * - honoree → sees everyone (active + pending + declined)
 * - active participant → sees co-participants (own row + others)
 * - pending / outsider → won't see this hook called (the UI only mounts
 *   it for honoree)
 *
 * Follows the project's setState-only-in-then convention (a pure free
 * fetcher + useEffect that updates state inside .then). Realtime
 * subscription on event_participants picks up joins/leaves; debounced
 * to collapse burst writes into one refresh.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { debounce } from '../lib/debounce';

export type ParticipantStatus = 'active' | 'pending' | 'declined';

export interface EventParticipant {
  user_id: string;
  status: ParticipantStatus;
  joined_at: string | null;
  invited_at: string | null;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
}

export type EventParticipantsQuery =
  | { status: 'loading'; participants: null; error: null }
  | { status: 'ready'; participants: EventParticipant[]; error: null }
  | { status: 'error'; participants: null; error: string };

interface RawRow {
  user_id: string;
  status: ParticipantStatus;
  joined_at: string | null;
  invited_at: string | null;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loaded'; eventId: string; participants: EventParticipant[] }
  | { kind: 'failed'; eventId: string; error: string };

// Two queries, NOT a PostgREST embed. `event_participants.user_id` FKs to
// `auth.users` (and there are two such FKs — user_id + invited_by), so there is
// no resolvable `event_participants → profiles` relationship: the embed
// `profiles!user_id(...)` errors with PGRST200 and the whole list silently
// renders empty (the bug behind the missing "who else is gifting" section).
// Fetch the rows, then the profiles by id — readable for co-participants via
// the profiles co-participant SELECT policy (20260530120000). A profile the
// viewer can't read (e.g. a pending invitee) falls back to a dash rather than
// dropping the row.
async function load(eventId: string): Promise<FetchState> {
  const { data: rows, error } = await supabase
    .from('event_participants')
    .select('user_id, status, joined_at, invited_at')
    .eq('event_id', eventId)
    .returns<RawRow[]>();
  if (error) return { kind: 'failed', eventId, error: error.message };

  const ids = (rows ?? []).map((r) => r.user_id);
  const profilesById = new Map<
    string,
    { display_name: string | null; handle: string | null; avatar_url: string | null }
  >();
  if (ids.length > 0) {
    const { data: profs, error: profErr } = await supabase
      .from('profiles')
      .select('id, display_name, handle, avatar_url')
      .in('id', ids);
    if (profErr) return { kind: 'failed', eventId, error: profErr.message };
    for (const p of profs ?? []) {
      profilesById.set(p.id, {
        display_name: p.display_name,
        handle: p.handle,
        avatar_url: p.avatar_url,
      });
    }
  }

  const participants: EventParticipant[] = (rows ?? []).map((r) => {
    const prof = profilesById.get(r.user_id);
    return {
      user_id: r.user_id,
      status: r.status,
      joined_at: r.joined_at,
      invited_at: r.invited_at,
      display_name: prof?.display_name ?? '—',
      handle: prof?.handle ?? null,
      avatar_url: prof?.avatar_url ?? null,
    };
  });

  return { kind: 'loaded', eventId, participants };
}

export function useEventParticipants(eventId: string | null): {
  query: EventParticipantsQuery;
  refresh: () => Promise<void>;
} {
  const { user, status: authStatus } = useAuth();
  const [fetched, setFetched] = useState<FetchState>({ kind: 'idle' });

  useEffect(() => {
    if (authStatus !== 'authenticated' || !user || !eventId) return undefined;
    let cancelled = false;

    void load(eventId).then((state) => {
      if (!cancelled) setFetched(state);
    });

    return () => {
      cancelled = true;
    };
  }, [authStatus, user, eventId]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!eventId) return;
    const state = await load(eventId);
    setFetched(state);
  }, [eventId]);

  // Realtime: participants table changes (someone joined, status flipped).
  // Debounced so a burst of writes collapses into one refetch.
  useEffect(() => {
    if (!eventId || authStatus !== 'authenticated') return undefined;
    const trigger = debounce(() => {
      void refresh();
    }, 300);

    const channel = supabase
      .channel(`event-participants:${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_participants', filter: `event_id=eq.${eventId}` },
        trigger,
      )
      .subscribe();

    return () => {
      trigger.cancel();
      void supabase.removeChannel(channel);
    };
  }, [eventId, authStatus, refresh]);

  const query = useMemo<EventParticipantsQuery>(() => {
    if (!eventId) return { status: 'loading', participants: null, error: null };
    if (fetched.kind === 'idle' || fetched.eventId !== eventId) {
      return { status: 'loading', participants: null, error: null };
    }
    if (fetched.kind === 'loaded') {
      return { status: 'ready', participants: fetched.participants, error: null };
    }
    return { status: 'error', participants: null, error: fetched.error };
  }, [eventId, fetched]);

  return { query, refresh };
}
