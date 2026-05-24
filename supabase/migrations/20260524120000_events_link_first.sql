-- ============================================================================
-- events link-first redesign — schema additions + event_circles drop
-- ============================================================================
-- Replaces the circles-first audience model with a link-first share token +
-- event_participants table. Existing events data is wiped (testing phase,
-- no real users per pivot 2026-05-24). Helpers can_see_event and
-- can_see_item are rewired to use the new participant path in follow-up
-- migrations.
--
-- See: docs/superpowers/specs/2026-05-24-events-link-first-design.md
-- ============================================================================

-- 1. Wipe existing event data (no real users — safe)
delete from public.event_items;
delete from public.event_circles;
delete from public.events;

-- 2. Drop policies that reference event_circles (so we can drop the table).
--    - "events: audience members can read" gets replaced by a participant-based
--      policy in the follow-up RLS migration (Task A.4).
--    - "items: visible via event audience" is recreated below using the new
--      event_participants path.
drop policy if exists "events: audience members can read" on public.events;
drop policy if exists "items: visible via event audience" on public.items;

-- 3. Drop event_circles — circles retired from event flow entirely
drop table public.event_circles;

-- 4. events.share_token: 16-hex-char URL-safe id, mirrors wishlist token format
alter table public.events
  add column share_token text not null
    default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);

create unique index events_share_token_idx on public.events(share_token);

-- 5. NEW table event_participants — link-first audience tracking
create table public.event_participants (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'active'
                    check (status in ('pending', 'active', 'declined')),
  invited_by      uuid references auth.users(id),
  invited_at      timestamptz,
  joined_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (event_id, user_id)
);

create index event_participants_user_status_idx
  on public.event_participants(user_id, status);
create index event_participants_event_status_idx
  on public.event_participants(event_id, status);

create trigger event_participants_updated_at
  before update on public.event_participants
  for each row execute function public.set_updated_at();

-- 6. Recreate "items: visible via event audience" using the new event_participants
--    path. Same intent as the legacy event_items → event_circles → group_members
--    chain, just via active participants now.
create policy "items: visible via event audience"
  on public.items for select
  using (
    exists (
      select 1
      from public.event_items ei
      join public.event_participants ep on ep.event_id = ei.event_id
      where ei.item_id = items.id
        and ep.user_id = auth.uid()
        and ep.status = 'active'
    )
  );

-- 7. Realtime publication: event_circles was auto-removed by `drop table` above;
--    add event_participants for client-side realtime subscriptions.
alter publication supabase_realtime add table public.event_participants;
