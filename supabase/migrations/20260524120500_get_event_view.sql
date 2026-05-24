-- SECURITY DEFINER RPC: public event view via share token.
-- Self-contained auth check; masks claim status by viewer role.

create or replace function public.get_event_view(_token text)
returns table (
  event_id            uuid,
  title               text,
  kind                text,
  occurs_on           date,
  note                text,
  honoree_id          uuid,
  honoree_name        text,
  honoree_avatar_url  text,
  my_status           text,
  participant_count   integer,
  items               jsonb
)
language plpgsql security definer
set search_path = public
as $$
declare
  _eid         uuid;
  _ehonoree    uuid;
  _viewer      uuid := auth.uid();
  _is_honoree  boolean;
  _is_active   boolean;
  _my_status   text;
begin
  -- 1. Resolve token → event_id
  select e.id, e.honoree_id into _eid, _ehonoree
  from public.events e
  where e.share_token = _token;

  if _eid is null then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;

  -- 2. Determine viewer role
  _is_honoree := _viewer = _ehonoree;

  if _viewer is null then
    _my_status := 'anon';
  elsif _is_honoree then
    _my_status := 'honoree';
  else
    select ep.status into _my_status
    from public.event_participants ep
    where ep.event_id = _eid and ep.user_id = _viewer;
    if _my_status is null then _my_status := 'guest'; end if;
  end if;

  _is_active := _my_status = 'active';

  -- 3. Return query
  return query
  select
    e.id,
    e.title,
    e.kind,
    e.occurs_on,
    e.note,
    e.honoree_id,
    p.display_name,
    p.avatar_url,
    _my_status,
    (select count(*)::int from public.event_participants ep
       where ep.event_id = e.id and ep.status = 'active'),
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'id',          i.id,
        'title',       i.title,
        'cover_url',   i.cover_url,
        'url',         i.url,
        'price_text',  i.price_text,
        'maker',       i.maker,
        'priority',    i.priority,
        'is_claimed',
          case
            when _is_active and not _is_honoree then
              exists(select 1 from public.claims c where c.item_id = i.id)
            else null
          end
       ) order by ei.added_at)
       from public.event_items ei
       join public.items i on i.id = ei.item_id
       where ei.event_id = e.id),
      '[]'::jsonb
    )
  from public.events e
  join public.profiles p on p.id = e.honoree_id
  where e.id = _eid;
end; $$;

grant execute on function public.get_event_view(text) to anon, authenticated;
