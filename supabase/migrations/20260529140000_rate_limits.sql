-- supabase/migrations/20260529140000_rate_limits.sql
--
-- Per-user sliding-window rate limiting for abuse-prone inserts, ahead of
-- public traffic. An append-only log + a SECURITY DEFINER helper called
-- from BEFORE INSERT triggers on the protected tables.
--
-- auth.uid() is NULL for the service_role and for anonymous callers, so
-- both stay UNRESTRICTED in v1: seed/admin inserts pass through, and
-- anonymous reports stay open (they're rare enough to triage manually).
-- Design sketch: PUBLIC_LAUNCH.md → "Rate limits".

create table public.rate_limit_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid,          -- nullable; anon / service_role stay unrestricted
  action     text not null, -- 'item_create' | 'invite_create' | 'report_create'
  created_at timestamptz not null default now()
);

create index rate_limit_log_action_user_idx
  on public.rate_limit_log (action, user_id, created_at desc);

-- Clients never touch this table directly. Enable RLS with no policies so
-- it's locked to everyone except SECURITY DEFINER functions (run as owner,
-- bypass RLS) and service_role (bypassrls).
alter table public.rate_limit_log enable row level security;

create or replace function public.enforce_rate_limit(
  _action text, _max int, _window_minutes int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _count int;
begin
  -- Anonymous + service_role have no uid → unrestricted in v1.
  if _uid is null then
    return;
  end if;

  select count(*) into _count
    from public.rate_limit_log
   where action = _action
     and user_id = _uid
     and created_at > now() - (_window_minutes || ' minutes')::interval;

  if _count >= _max then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.rate_limit_log (user_id, action) values (_uid, _action);
end;
$$;

revoke all on function public.enforce_rate_limit(text, int, int)
  from public, anon, authenticated;

-- ── Per-table BEFORE INSERT triggers, tuned per surface ──────────────────
-- The trigger fns are SECURITY DEFINER so they run as the owner and can
-- call enforce_rate_limit — which we revoked from authenticated/anon so it
-- can't be invoked directly. (A SECURITY INVOKER trigger fn would run as
-- the inserting role and hit "permission denied" on that revoked call.)

-- items: 100/hour — lavish, wishlist drafting is bursty.
create or replace function public.rl_items() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.enforce_rate_limit('item_create', 100, 60);
  return new;
end;
$$;
create trigger rate_limit_items
  before insert on public.items
  for each row execute function public.rl_items();

-- friend invites: 10/hour — one invite per friend is plenty.
create or replace function public.rl_friend_invites() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.enforce_rate_limit('invite_create', 10, 60);
  return new;
end;
$$;
create trigger rate_limit_friend_invites
  before insert on public.friend_invites
  for each row execute function public.rl_friend_invites();

-- reports: 20/hour for signed-in reporters (anon stays unrestricted via
-- the auth.uid() NULL short-circuit; triaged manually in v1).
create or replace function public.rl_reports() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.enforce_rate_limit('report_create', 20, 60);
  return new;
end;
$$;
create trigger rate_limit_reports
  before insert on public.reports
  for each row execute function public.rl_reports();

-- Add the new log to the integration-test reset so per-test runs start
-- clean (otherwise accumulated rows trip limits across tests).
create or replace function public.truncate_test_state()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table
    public.santa_assignments,
    public.santa_exclusions,
    public.santa_participants,
    public.santa_events,
    public.event_participants,
    public.event_items,
    public.events,
    public.claims,
    public.item_photos,
    public.item_groups,
    public.items,
    public.invites,
    public.group_members,
    public.groups,
    public.reports,
    public.friend_invites,
    public.friendships,
    public.rate_limit_log
    restart identity
    cascade;
end;
$$;
revoke all on function public.truncate_test_state() from public, anon, authenticated;
grant execute on function public.truncate_test_state() to service_role;
