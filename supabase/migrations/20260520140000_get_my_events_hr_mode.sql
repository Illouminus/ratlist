-- supabase/migrations/20260520140000_get_my_events_hr_mode.sql
--
-- Re-create get_my_events() with HR-mode columns.
--
-- Changes vs. the original in 20260517180518_events.sql:
--   • Returns `created_by uuid` (new)
--   • Returns `honoree_name text` (new — text fallback when honoree_id is null)
--   • Returns `is_creator boolean` (new — caller is the event creator)
--   • `honoree_id` is now nullable (NULL for non-user honorees)
--   • `honoree_display_name` / `honoree_handle` / `honoree_avatar_url` are
--     NULL when honoree_id is NULL — join is outer
--   • WHERE clause already covered via can_see_event() which was updated in
--     20260520130000 to include `created_by = auth.uid()`
--
-- We must DROP and re-CREATE because Postgres forbids changing a function's
-- return type with CREATE OR REPLACE.

drop function if exists public.get_my_events();

create function public.get_my_events()
returns table (
  id                    uuid,
  created_by            uuid,
  honoree_id            uuid,
  honoree_name          text,
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
  is_honoree            boolean,
  is_creator            boolean
)
language sql stable security invoker
set search_path = public
as $$
  select
    e.id,
    e.created_by,
    e.honoree_id,
    e.honoree_name,
    p.display_name   as honoree_display_name,
    p.handle::text   as honoree_handle,
    p.avatar_url     as honoree_avatar_url,
    e.title,
    e.kind,
    e.occurs_on,
    e.note,
    e.created_at,
    e.updated_at,
    coalesce(ic.cnt, 0) as item_count,
    coalesce(ac.cnt, 0) as audience_circle_count,
    (e.honoree_id = auth.uid())  as is_honoree,
    (e.created_by  = auth.uid()) as is_creator
  from public.events e
  -- Outer join: non-user honorees have honoree_id = NULL, so no profile row
  left join public.profiles p on p.id = e.honoree_id
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
    -- Upcoming events first (soonest-future at top), then undated,
    -- then past events most-recent first.
    case
      when e.occurs_on is null then 1
      when e.occurs_on >= current_date then 0
      else 2
    end,
    case when e.occurs_on >= current_date then e.occurs_on end asc  nulls last,
    case when e.occurs_on <  current_date then e.occurs_on end desc nulls last,
    e.created_at desc;
$$;

revoke all     on function public.get_my_events() from public;
grant  execute on function public.get_my_events() to authenticated;
