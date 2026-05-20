-- supabase/migrations/20260520130000_events_hr_mode_fixes.sql
-- Follow-up to 20260520120000_events_hr_mode.sql
-- Caught by code review — four fixes:
--   1. owns_event: extend to cover created_by (HR creator locked out of
--      event_circles / event_items management without this)
--   2. can_see_event: extend to cover created_by (HR creator's events were
--      silently absent from get_my_events RPC without this)
--   3. Index on events(created_by): RLS policies and hooks filter by this
--      column but no index existed
--   4. DEFAULT auth.uid() on events.created_by: lets direct INSERTs work
--      without explicitly supplying the column
--   5. Mark is_honoree_of_item as STABLE for planner caching

-- 1. owns_event — creator OR honoree
create or replace function public.owns_event(_event_id uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.events
    where id = _event_id
      and (created_by = auth.uid() or honoree_id = auth.uid())
  );
$$;

-- 2. can_see_event — creator OR honoree OR audience-circle member
create or replace function public.can_see_event(_event_id uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.id = _event_id
      and (
        e.created_by = auth.uid()
        or e.honoree_id = auth.uid()
        or exists (
          select 1
          from public.event_circles ec
          join public.group_members gm on gm.group_id = ec.group_id
          where ec.event_id = e.id and gm.user_id = auth.uid()
        )
      )
  );
$$;

-- 3. Index on events(created_by)
create index if not exists events_created_by_idx on public.events(created_by);

-- 4. Default auth.uid() on events.created_by
alter table public.events alter column created_by set default auth.uid();

-- 5. Mark is_honoree_of_item as STABLE
alter function public.is_honoree_of_item(uuid) stable;
