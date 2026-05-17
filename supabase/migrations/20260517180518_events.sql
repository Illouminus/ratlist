-- ============================================================================
-- events — first-class "occasion" entity (birthday, holidays, anniversaries…)
-- ============================================================================
-- An event is owned by a single user (the honoree — whose wishlist it is).
-- It is open to one or more circles (audience) and bundles a subset of the
-- honoree's items (the highlight for this occasion). Items themselves are
-- not duplicated; `event_items` is just a curation junction on top of the
-- existing wishlist.
--
-- Visibility model:
--   * `events`        — readable by the honoree and by members of any
--                       audience circle. Mutable only by the honoree.
--   * `event_circles` — same visibility as the event. Mutable only by the
--                       honoree, and only to circles the honoree belongs to
--                       (you can't open your event to a circle you don't
--                       inhabit).
--   * `event_items`   — readable when the event is visible AND the item is
--                       visible to the viewer through the existing item RLS
--                       (item_groups → group_members). Mutable only by the
--                       honoree, and only for items they own.
--
-- Santa stays its own module — `santa_events` is unaffected. If we later
-- collapse Santa into this table we'll add `kind = 'santa'` and a join.
-- For now they coexist.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- events
-- ────────────────────────────────────────────────────────────────────────────
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  honoree_id  uuid not null references public.profiles(id) on delete cascade,
  title       text not null check (length(title) between 1 and 120),
  -- Closed set mirrors items.occasion so the two stay aligned. `other` is
  -- the catch-all; UI lets the user type a free-form `note` for context.
  kind        text not null default 'other'
              check (kind in ('birthday', 'holidays', 'anniversary', 'wedding', 'housewarming', 'other')),
  occurs_on   date,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index events_honoree_idx on public.events(honoree_id);
create index events_occurs_on_idx on public.events(occurs_on);

create trigger events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- event_circles — audience for an event (which circles can see it)
-- ────────────────────────────────────────────────────────────────────────────
create table public.event_circles (
  event_id  uuid not null references public.events(id) on delete cascade,
  group_id  uuid not null references public.groups(id) on delete cascade,
  primary key (event_id, group_id)
);

create index event_circles_group_idx on public.event_circles(group_id);

-- ────────────────────────────────────────────────────────────────────────────
-- event_items — curated subset of the honoree's items for this event
-- ────────────────────────────────────────────────────────────────────────────
create table public.event_items (
  event_id  uuid not null references public.events(id) on delete cascade,
  item_id   uuid not null references public.items(id) on delete cascade,
  -- `position` lets the honoree order items in the event view. Higher
  -- value = more prominent; ties broken by created_at. Nullable so the
  -- common "I don't care about order" case doesn't need explicit values.
  position  smallint,
  added_at  timestamptz not null default now(),
  primary key (event_id, item_id)
);

create index event_items_item_idx on public.event_items(item_id);

-- ────────────────────────────────────────────────────────────────────────────
-- Helpers (SECURITY DEFINER — bypass recursive RLS)
-- ────────────────────────────────────────────────────────────────────────────
-- Can the current user see this event? Honoree or audience-circle member.
create or replace function public.can_see_event(_event_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.id = _event_id
      and (
        e.honoree_id = auth.uid()
        or exists (
          select 1
          from public.event_circles ec
          join public.group_members gm on gm.group_id = ec.group_id
          where ec.event_id = e.id and gm.user_id = auth.uid()
        )
      )
  );
$$;

-- Am I the honoree (owner) of the event?
create or replace function public.owns_event(_event_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events
    where id = _event_id and honoree_id = auth.uid()
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────────────────────
alter table public.events        enable row level security;
alter table public.event_circles enable row level security;
alter table public.event_items   enable row level security;

-- events ─────────────────────────────────────────────────────────────────────
create policy "events: honoree can read"
  on public.events for select
  using (honoree_id = auth.uid());

create policy "events: audience members can read"
  on public.events for select
  using (
    exists (
      select 1
      from public.event_circles ec
      join public.group_members gm on gm.group_id = ec.group_id
      where ec.event_id = events.id and gm.user_id = auth.uid()
    )
  );

create policy "events: anyone authenticated can create as themselves"
  on public.events for insert
  with check (honoree_id = auth.uid());

create policy "events: honoree can update"
  on public.events for update
  using (honoree_id = auth.uid())
  with check (honoree_id = auth.uid());

create policy "events: honoree can delete"
  on public.events for delete
  using (honoree_id = auth.uid());

-- event_circles ──────────────────────────────────────────────────────────────
create policy "event_circles: visible if event is visible"
  on public.event_circles for select
  using (public.can_see_event(event_id));

create policy "event_circles: honoree manages, must belong to the circle"
  on public.event_circles for insert
  with check (
    public.owns_event(event_id)
    and public.is_group_member(group_id)
  );

create policy "event_circles: honoree can revoke"
  on public.event_circles for delete
  using (public.owns_event(event_id));

-- event_items ────────────────────────────────────────────────────────────────
-- Read: event must be visible AND viewer must be able to see the item by
-- the existing item-visibility rules. The honoree always sees their own
-- items, so they always see their event_items.
create policy "event_items: visible if event AND item are visible"
  on public.event_items for select
  using (
    public.can_see_event(event_id)
    and public.can_see_item(item_id)
  );

-- Insert: only the honoree, only for items they own. (An honoree cannot
-- bundle someone else's item into their event — visibility would leak.)
create policy "event_items: honoree adds own items"
  on public.event_items for insert
  with check (
    public.owns_event(event_id)
    and public.owns_item(item_id)
  );

create policy "event_items: honoree can reorder"
  on public.event_items for update
  using (public.owns_event(event_id))
  with check (public.owns_event(event_id));

create policy "event_items: honoree can remove"
  on public.event_items for delete
  using (public.owns_event(event_id));

-- ────────────────────────────────────────────────────────────────────────────
-- get_my_events — denormalised list view for the Events tab
-- ────────────────────────────────────────────────────────────────────────────
-- Returns every event visible to the caller (their own + ones whose audience
-- includes any of their circles). Eager-joins the honoree's display data
-- and aggregates counts so the UI doesn't need a follow-up round-trip.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.get_my_events()
returns table (
  id                    uuid,
  honoree_id            uuid,
  honoree_display_name  text,
  honoree_handle        text,
  honoree_avatar_url    text,
  title                 text,
  kind                  text,
  occurs_on             date,
  note                  text,
  created_at            timestamptz,
  updated_at            timestamptz,
  item_count            bigint,
  audience_circle_count bigint,
  is_honoree            boolean
)
language sql stable security invoker
set search_path = public
as $$
  select
    e.id,
    e.honoree_id,
    p.display_name as honoree_display_name,
    p.handle::text as honoree_handle,
    p.avatar_url as honoree_avatar_url,
    e.title,
    e.kind,
    e.occurs_on,
    e.note,
    e.created_at,
    e.updated_at,
    coalesce(ic.cnt, 0) as item_count,
    coalesce(ac.cnt, 0) as audience_circle_count,
    (e.honoree_id = auth.uid()) as is_honoree
  from public.events e
  join public.profiles p on p.id = e.honoree_id
  left join lateral (
    select count(*)::bigint as cnt
    from public.event_items
    where event_id = e.id
  ) ic on true
  left join lateral (
    select count(*)::bigint as cnt
    from public.event_circles
    where event_id = e.id
  ) ac on true
  where public.can_see_event(e.id)
  order by
    -- Upcoming events first (sort soonest-future at top), then undated,
    -- then past events most-recent first.
    case
      when e.occurs_on is null then 1
      when e.occurs_on >= current_date then 0
      else 2
    end,
    case when e.occurs_on >= current_date then e.occurs_on end asc nulls last,
    case when e.occurs_on <  current_date then e.occurs_on end desc nulls last,
    e.created_at desc;
$$;

revoke all     on function public.get_my_events() from public;
grant  execute on function public.get_my_events() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Realtime — opt the three new tables into the publication so the client's
-- channel subscriptions catch INSERT/UPDATE/DELETE without polling.
-- Same pattern as 20260516134348_realtime_publication / 20260516142439_realtime_groups.
-- ────────────────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.event_circles;
alter publication supabase_realtime add table public.event_items;
