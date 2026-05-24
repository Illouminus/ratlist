-- SECURITY INVOKER RPC: bulk pre-invite. RLS INSERT policy gates honoree-only.
-- Returns count of new rows actually inserted (dups skipped via on conflict).
create or replace function public.invite_to_event(_event_id uuid, _user_ids uuid[])
returns integer
language plpgsql security invoker
set search_path = public
as $$
declare _inserted integer;
begin
  with new_invites as (
    insert into public.event_participants (event_id, user_id, status, invited_by, invited_at)
    select _event_id, uid, 'pending', auth.uid(), now()
    from unnest(_user_ids) as uid
    on conflict (event_id, user_id) do nothing
    returning 1
  )
  select count(*)::int into _inserted from new_invites;
  return _inserted;
end; $$;

grant execute on function public.invite_to_event(uuid, uuid[]) to authenticated;
