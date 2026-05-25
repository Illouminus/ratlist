-- Rewrite get_my_events for the link-first model.
-- Returns events where caller is honoree OR active OR pending.
-- Adds: share_token, participant_count (active only), my_status.
-- Drops: audience_circle_count.

drop function if exists public.get_my_events();

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
  share_token           text,
  item_count            bigint,
  participant_count     bigint,
  my_status             text
)
-- SECURITY DEFINER: pending invitees need to see their event in /events
-- list BEFORE joining (events RLS only allows honoree/active SELECT).
-- The WHERE clause below restricts to caller's own events anyway.
language sql stable security definer
set search_path = public
as $$
  with my_role as (
    select e.id as event_id,
           case
             when e.honoree_id = auth.uid() then 'honoree'
             else (
               select ep.status
               from public.event_participants ep
               where ep.event_id = e.id and ep.user_id = auth.uid()
               limit 1
             )
           end as my_status
    from public.events e
    where e.honoree_id = auth.uid()
       or exists (
         select 1 from public.event_participants ep
         where ep.event_id = e.id and ep.user_id = auth.uid()
       )
  )
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
    e.share_token,
    coalesce(ic.cnt, 0) as item_count,
    coalesce(pc.cnt, 0) as participant_count,
    mr.my_status
  from public.events e
  join my_role mr on mr.event_id = e.id
  join public.profiles p on p.id = e.honoree_id
  left join lateral (
    select count(*)::bigint as cnt from public.event_items where event_id = e.id
  ) ic on true
  left join lateral (
    select count(*)::bigint as cnt from public.event_participants ep
    where ep.event_id = e.id and ep.status = 'active'
  ) pc on true
  order by
    case
      when e.occurs_on is null then 1
      when e.occurs_on >= current_date then 0
      else 2
    end,
    case when e.occurs_on >= current_date then e.occurs_on end asc nulls last,
    case when e.occurs_on <  current_date then e.occurs_on end desc nulls last,
    e.created_at desc;
$$;

grant execute on function public.get_my_events() to authenticated;
