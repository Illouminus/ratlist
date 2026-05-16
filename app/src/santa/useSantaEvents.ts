/**
 * `useSantaEvents` — list of Secret Santa events visible to the caller +
 * create a new one. Backed by the `get_my_santa_events` RPC, which
 * already attaches participant_count, is_organiser, is_participant in
 * one round-trip.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';

export type SantaStatus = 'collecting' | 'drawn' | 'revealed' | 'cancelled';

export interface MySantaEvent {
  id: string;
  group_id: string;
  group_name: string;
  name: string;
  budget_text: string | null;
  gift_date: string | null;
  draw_deadline: string | null;
  status: SantaStatus;
  created_by: string;
  created_at: string;
  participant_count: number;
  is_organiser: boolean;
  is_participant: boolean;
}

export type SantaEventsQuery =
  | { status: 'loading'; events: null; error: null }
  | { status: 'anonymous'; events: null; error: null }
  | { status: 'ready'; events: MySantaEvent[]; error: null }
  | { status: 'error'; events: null; error: string };

export interface CreateSantaInput {
  group_id: string;
  name: string;
  budget_text?: string | null;
  gift_date?: string | null;     // ISO date (YYYY-MM-DD)
  draw_deadline?: string | null; // ISO datetime
}

export interface UseSantaEventsResult {
  query: SantaEventsQuery;
  refresh: () => Promise<void>;
  createEvent: (
    input: CreateSantaInput,
  ) => Promise<{ event: MySantaEvent } | { error: string }>;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loaded'; userId: string; events: MySantaEvent[] }
  | { kind: 'failed'; userId: string; error: string };

async function loadEvents(userId: string): Promise<FetchState> {
  const { data, error } = await supabase.rpc('get_my_santa_events');
  if (error) return { kind: 'failed', userId, error: error.message };
  return { kind: 'loaded', userId, events: (data ?? []) as MySantaEvent[] };
}

export function useSantaEvents(): UseSantaEventsResult {
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

  const query = useMemo<SantaEventsQuery>(() => {
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

  const refresh = useCallback(async () => {
    if (!user) return;
    const state = await loadEvents(user.id);
    setFetched(state);
  }, [user]);

  const createEvent = useCallback(
    async (
      input: CreateSantaInput,
    ): Promise<{ event: MySantaEvent } | { error: string }> => {
      if (!user) return { error: 'not authenticated' };
      const { data, error } = await supabase
        .from('santa_events')
        .insert({
          group_id: input.group_id,
          name: input.name,
          budget_text: input.budget_text ?? null,
          gift_date: input.gift_date ?? null,
          draw_deadline: input.draw_deadline ?? null,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (error || !data) return { error: error?.message ?? 'unknown error' };

      const state = await loadEvents(user.id);
      setFetched(state);
      const created =
        state.kind === 'loaded' ? state.events.find((e) => e.id === data.id) : undefined;
      if (!created) return { error: 'failed to reload event' };
      return { event: created };
    },
    [user],
  );

  return { query, refresh, createEvent };
}
