-- SECURITY DEFINER RPC: idempotent self-join via share token.
-- Returns event_id for client redirect.
create or replace function public.join_event_via_token(_token text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  _eid uuid;
  _hid uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select id, honoree_id into _eid, _hid
  from public.events where share_token = _token;

  if _eid is null then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;

  -- Honoree gets no participant row — they have their own role.
  if _hid = auth.uid() then
    return _eid;
  end if;

  insert into public.event_participants (event_id, user_id, status, joined_at)
  values (_eid, auth.uid(), 'active', now())
  on conflict (event_id, user_id) do update
    set status     = 'active',
        joined_at  = coalesce(public.event_participants.joined_at, now()),
        updated_at = now();

  return _eid;
end; $$;

grant execute on function public.join_event_via_token(text) to authenticated;
