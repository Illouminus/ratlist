/**
 * Public-event RPC wrappers.
 *
 * The `/event/:token` flow goes through SECURITY DEFINER RPCs so anon
 * visitors (no JWT) can still pull event data and items. These two
 * functions wrap the supabase-js call shape into plain async fns that
 * either return the result or throw — callers stay free of `.data`
 * unwrapping and PostgrestError narrowing.
 *
 * Used by `EventLandingScreen` (anon + authed). The in-app coordinator
 * view (`/events/:id`) uses `useEvent(id)` which goes through RLS-gated
 * direct table reads — different path, no token.
 */
import { supabase } from '../lib/supabase';

/** Caller's relationship to the event, as returned by get_event_view. */
export type EventViewStatus = 'honoree' | 'active' | 'pending' | 'guest' | 'anon';

/**
 * One curated item from the event landing view. `is_claimed` is masked
 * (null) when the viewer is anon, pending, guest, or the honoree — only
 * active non-honoree participants see real claim state. See the RPC:
 * supabase/migrations/20260524120500_get_event_view.sql
 */
export interface EventViewItem {
  id: string;
  title: string;
  cover_url: string | null;
  url: string | null;
  price_text: string | null;
  maker: string | null;
  priority: number | null;
  is_claimed: boolean | null;
}

export interface EventView {
  event_id: string;
  title: string;
  kind: string;
  occurs_on: string | null;
  note: string | null;
  honoree_id: string;
  honoree_name: string;
  honoree_avatar_url: string | null;
  my_status: EventViewStatus;
  participant_count: number;
  items: EventViewItem[];
}

export async function getEventView(token: string): Promise<EventView> {
  const { data, error } = await supabase.rpc('get_event_view', { _token: token });
  if (error) throw error;
  // The RPC returns items as JSONB — supabase-js types it as `Json`. The
  // SQL function packs items with the exact shape EventViewItem expects;
  // we cast through unknown to acknowledge the boundary.
  const rows = (data as unknown as EventView[] | null) ?? [];
  const row = rows[0];
  if (!row) throw new Error('event_not_found');
  return row;
}

export async function joinEventViaToken(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_event_via_token', { _token: token });
  if (error) throw error;
  return data as string;
}
