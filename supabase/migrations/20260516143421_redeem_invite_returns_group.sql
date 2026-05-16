-- ============================================================================
-- redeem_invite() v2 — return the joined group's display fields.
-- ============================================================================
-- The original RPC returned just the group_id, so the invite landing
-- page had no name/emoji to render on success — it showed «добро
-- пожаловать в  …» with a blank slot at the end.
--
-- Widening the return shape lets the client render «добро пожаловать
-- в <name>» without a follow-up query. We CREATE OR REPLACE with a
-- different return type, so we DROP first (Postgres won't replace a
-- function whose return type changed).
-- ============================================================================

drop function if exists public.redeem_invite(text);

create or replace function public.redeem_invite(_token text)
returns table (
  group_id    uuid,
  group_name  text,
  group_emoji text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _invite public.invites%rowtype;
  _group  public.groups%rowtype;
begin
  select * into _invite from public.invites where token = _token;
  if not found then
    raise exception 'invite_not_found';
  end if;
  if _invite.used_at is not null then
    raise exception 'invite_already_used';
  end if;
  if _invite.expires_at < now() then
    raise exception 'invite_expired';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (_invite.group_id, auth.uid(), 'member')
  on conflict do nothing;

  update public.invites
  set used_at = now(), used_by = auth.uid()
  where token = _token;

  select * into _group from public.groups where id = _invite.group_id;

  return query select _group.id, _group.name, _group.emoji;
end;
$$;

revoke all     on function public.redeem_invite(text) from public;
grant  execute on function public.redeem_invite(text) to authenticated;
