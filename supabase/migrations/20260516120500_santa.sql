-- ============================================================================
-- Secret Santa — schema, RLS and draw algorithm
-- ============================================================================
-- An event lives inside a group: only group members can see it exists, and
-- only the people who explicitly joined become participants in the draw.
--
-- Privacy invariants this file enforces:
--   * santa_assignments rows are visible to the giver and to no one else,
--     including the event organiser, *until* the event is marked
--     'revealed' (at which point any member of the host group can see
--     everyone's pairings).
--   * The draw runs as a SECURITY DEFINER Postgres function — clients
--     never insert into santa_assignments directly. The algorithm is a
--     standard retry-loop random derangement that respects per-event
--     exclusion pairs (e.g. couples that shouldn't draw each other).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Events
-- ────────────────────────────────────────────────────────────────────────────
create table public.santa_events (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups(id) on delete cascade,
  name          text not null check (length(name) between 1 and 120),
  budget_text   text,
  gift_date     date,
  draw_deadline timestamptz,
  status        text not null default 'collecting'
                check (status in ('collecting', 'drawn', 'revealed', 'cancelled')),
  created_by    uuid not null references public.profiles(id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index santa_events_group_idx on public.santa_events(group_id);

create trigger santa_events_updated_at
before update on public.santa_events
for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Participants
-- ────────────────────────────────────────────────────────────────────────────
create table public.santa_participants (
  event_id  uuid not null references public.santa_events(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index santa_participants_user_idx on public.santa_participants(user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- Exclusions — directional. "user_a should not draw user_b." UI adds the
-- reverse row if the rule is symmetric (e.g. couples).
-- ────────────────────────────────────────────────────────────────────────────
create table public.santa_exclusions (
  event_id uuid not null references public.santa_events(id) on delete cascade,
  user_a   uuid not null references public.profiles(id) on delete cascade,
  user_b   uuid not null references public.profiles(id) on delete cascade,
  primary key (event_id, user_a, user_b),
  check (user_a <> user_b)
);

-- ────────────────────────────────────────────────────────────────────────────
-- Assignments — populated by run_santa_draw. UNIQUE per receiver per event
-- so no one is doubled-up.
-- ────────────────────────────────────────────────────────────────────────────
create table public.santa_assignments (
  event_id     uuid not null references public.santa_events(id) on delete cascade,
  giver_id     uuid not null references public.profiles(id) on delete cascade,
  receiver_id  uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (event_id, giver_id),
  unique (event_id, receiver_id),
  check (giver_id <> receiver_id)
);

-- ────────────────────────────────────────────────────────────────────────────
-- Helpers
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.is_santa_participant(_event_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.santa_participants
    where event_id = _event_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_santa_organiser(_event_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.santa_events
    where id = _event_id and created_by = auth.uid()
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────────────────────
alter table public.santa_events       enable row level security;
alter table public.santa_participants enable row level security;
alter table public.santa_exclusions   enable row level security;
alter table public.santa_assignments  enable row level security;

-- santa_events ───────────────────────────────────────────────────────────────
create policy "santa_events: group members can read"
  on public.santa_events for select
  using (public.is_group_member(group_id));

create policy "santa_events: group members can create"
  on public.santa_events for insert
  with check (
    public.is_group_member(group_id)
    and created_by = auth.uid()
  );

create policy "santa_events: organiser can update"
  on public.santa_events for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "santa_events: organiser can delete"
  on public.santa_events for delete
  using (created_by = auth.uid());

-- santa_participants ─────────────────────────────────────────────────────────
create policy "santa_participants: group members can read"
  on public.santa_participants for select
  using (
    exists (
      select 1 from public.santa_events e
      where e.id = santa_participants.event_id
        and public.is_group_member(e.group_id)
    )
  );

create policy "santa_participants: self-join while collecting"
  on public.santa_participants for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.santa_events e
      where e.id = event_id
        and e.status = 'collecting'
        and public.is_group_member(e.group_id)
    )
  );

create policy "santa_participants: self-leave while collecting"
  on public.santa_participants for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.santa_events e
      where e.id = event_id and e.status = 'collecting'
    )
  );

-- santa_exclusions ───────────────────────────────────────────────────────────
create policy "santa_exclusions: participants can read"
  on public.santa_exclusions for select
  using (public.is_santa_participant(event_id));

create policy "santa_exclusions: organiser manages while collecting"
  on public.santa_exclusions for all
  using (
    public.is_santa_organiser(event_id)
    and exists (
      select 1 from public.santa_events
      where id = event_id and status = 'collecting'
    )
  )
  with check (
    public.is_santa_organiser(event_id)
    and exists (
      select 1 from public.santa_events
      where id = event_id and status = 'collecting'
    )
  );

-- santa_assignments — THE CRITICAL ONE
-- Giver-only visibility until the event is revealed. Two SELECT policies
-- are OR'd by Postgres.
create policy "santa_assignments: giver sees own"
  on public.santa_assignments for select
  using (giver_id = auth.uid());

create policy "santa_assignments: everyone sees after reveal"
  on public.santa_assignments for select
  using (
    exists (
      select 1 from public.santa_events e
      where e.id = santa_assignments.event_id
        and e.status = 'revealed'
        and public.is_group_member(e.group_id)
    )
  );

-- No INSERT / UPDATE / DELETE policy — only the SECURITY DEFINER
-- `run_santa_draw` function writes to this table.

-- ────────────────────────────────────────────────────────────────────────────
-- run_santa_draw — pick a valid receiver for each participant
-- ────────────────────────────────────────────────────────────────────────────
-- Algorithm: random shuffle the receivers, check the resulting permutation
-- has no fixed point AND respects all exclusion pairs. Retry up to N times.
-- For N≤20 (our friend group), success in 1-3 attempts is typical even
-- with a handful of exclusions; the 100-iteration cap is generous.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.run_santa_draw(_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _event public.santa_events%rowtype;
  _givers uuid[];
  _receivers uuid[];
  _n int;
  _attempt int;
  _i int;
  _valid boolean;
begin
  -- Authorisation: only the organiser can trigger the draw.
  select * into _event from public.santa_events where id = _event_id;
  if not found then
    raise exception 'event_not_found';
  end if;
  if _event.created_by <> auth.uid() then
    raise exception 'not_organiser';
  end if;
  if _event.status <> 'collecting' then
    raise exception 'wrong_status';
  end if;

  -- Snapshot the participant set in a stable order so the algorithm is
  -- reproducible enough to debug.
  select array_agg(user_id order by joined_at) into _givers
  from public.santa_participants
  where event_id = _event_id;

  _n := coalesce(array_length(_givers, 1), 0);
  if _n < 2 then
    raise exception 'too_few_participants';
  end if;

  -- Try up to 100 random permutations
  for _attempt in 1..100 loop
    select array_agg(g order by random()) into _receivers
    from unnest(_givers) as g;

    _valid := true;
    for _i in 1.._n loop
      -- no one gives to themselves
      if _givers[_i] = _receivers[_i] then
        _valid := false;
        exit;
      end if;
      -- no excluded pair
      if exists (
        select 1 from public.santa_exclusions
        where event_id = _event_id
          and user_a = _givers[_i]
          and user_b = _receivers[_i]
      ) then
        _valid := false;
        exit;
      end if;
    end loop;

    if _valid then
      -- Wipe any stale assignments (e.g. a previous failed attempt left
      -- partial rows) and write the new permutation.
      delete from public.santa_assignments where event_id = _event_id;
      for _i in 1.._n loop
        insert into public.santa_assignments (event_id, giver_id, receiver_id)
        values (_event_id, _givers[_i], _receivers[_i]);
      end loop;

      update public.santa_events
        set status = 'drawn', updated_at = now()
      where id = _event_id;

      return;
    end if;
  end loop;

  raise exception 'no_valid_assignment';
end;
$$;

revoke all     on function public.run_santa_draw(uuid) from public;
grant  execute on function public.run_santa_draw(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- reveal_santa_event — flip the event to 'revealed' so everyone in the
-- group can see the pairings.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.reveal_santa_event(_event_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.santa_events
    set status = 'revealed', updated_at = now()
  where id = _event_id
    and created_by = auth.uid()
    and status = 'drawn';

  if not found then
    raise exception 'cannot_reveal';
  end if;
end;
$$;

revoke all     on function public.reveal_santa_event(uuid) from public;
grant  execute on function public.reveal_santa_event(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- get_my_santa_events — list events visible to the caller, with their own
-- participation status and a peer count. Same one-round-trip pattern as
-- get_my_groups / get_people.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.get_my_santa_events()
returns table (
  id              uuid,
  group_id        uuid,
  group_name      text,
  name            text,
  budget_text     text,
  gift_date       date,
  draw_deadline   timestamptz,
  status          text,
  created_by      uuid,
  created_at      timestamptz,
  participant_count bigint,
  is_organiser    boolean,
  is_participant  boolean
)
language sql stable security invoker
set search_path = public
as $$
  select
    e.id,
    e.group_id,
    g.name as group_name,
    e.name,
    e.budget_text,
    e.gift_date,
    e.draw_deadline,
    e.status,
    e.created_by,
    e.created_at,
    coalesce(pc.cnt, 0) as participant_count,
    (e.created_by = auth.uid()) as is_organiser,
    exists (
      select 1 from public.santa_participants
      where event_id = e.id and user_id = auth.uid()
    ) as is_participant
  from public.santa_events e
  join public.groups g on g.id = e.group_id
  left join lateral (
    select count(*)::bigint as cnt
    from public.santa_participants
    where event_id = e.id
  ) pc on true
  where public.is_group_member(e.group_id)
  order by e.created_at desc;
$$;

revoke all     on function public.get_my_santa_events() from public;
grant  execute on function public.get_my_santa_events() to authenticated;
