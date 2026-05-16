-- ============================================================================
-- create_group() RPC — atomic group + admin bootstrap in a single call.
-- ============================================================================
-- Why this exists:
--   The original client flow was `INSERT INTO groups ... RETURNING *`, with
--   an AFTER ROW trigger (`bootstrap_group_admin`) inserting the creator
--   into `group_members`. PostgreSQL evaluates RETURNING per-row *before*
--   AFTER ROW triggers fire, so the SELECT RLS check on `groups` ran while
--   the creator was not yet a member — 42501 → «нет доступа» in the UI.
--
--   We patched the symptom with an extra "creator can read" SELECT policy
--   (see 20260516124422_groups_creator_select.sql), but the underlying
--   flow is still RLS-zigzag-shaped: insert as authenticated, rely on a
--   trigger, rely on a special-case policy.
--
-- This RPC straightens that out: SECURITY DEFINER, the function does both
-- inserts in one shot and returns the freshly-created group row. The
-- client gets a typed return value, no RETURNING-RLS dance, and the
-- creator-can-read policy is still there as defence-in-depth (we don't
-- drop it — direct INSERT into `groups` still works for anything that
-- doesn't go through this RPC).
--
-- The function still respects who the caller is: it pins `created_by` to
-- `auth.uid()` (callers can't claim group ownership for someone else) and
-- raises if no authenticated user is present.
-- ============================================================================

create or replace function public.create_group(
  _name        text,
  _emoji       text default null,
  _description text default null
)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _row    public.groups;
begin
  if _caller is null then
    raise exception 'not_authenticated';
  end if;

  -- Trim + normalise on the way in. The DB has no NOT NULL/length check on
  -- `name` itself (the client enforces 1..80), so we at least reject empty
  -- input here so we never persist a blank group.
  if coalesce(btrim(_name), '') = '' then
    raise exception 'group_name_required';
  end if;

  insert into public.groups (name, emoji, description, created_by)
  values (btrim(_name), nullif(btrim(_emoji), ''), nullif(btrim(_description), ''), _caller)
  returning * into _row;

  -- The bootstrap_group_admin AFTER trigger would also add this row; doing
  -- it explicitly inside the same transaction is faster (one INSERT vs
  -- trigger overhead) and makes the function self-contained. The trigger
  -- uses ON CONFLICT DO NOTHING, so this double-insert is safe even if a
  -- future change reorders things.
  insert into public.group_members (group_id, user_id, role)
  values (_row.id, _caller, 'admin')
  on conflict do nothing;

  return _row;
end;
$$;

revoke all     on function public.create_group(text, text, text) from public;
grant  execute on function public.create_group(text, text, text) to authenticated;
