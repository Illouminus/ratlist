-- ============================================================================
-- profiles: onboarding state and handle validation
-- ============================================================================
-- `onboarded_at` signals the user has gone through the first-time setup
-- screen (display name, optional handle). NULL means "still needs onboarding".
-- handle gets a format check so we don't end up with weird characters in URLs.
-- ============================================================================

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

-- Handle: 2-32 chars, latin letters/digits/underscore/dash, no leading dash.
alter table public.profiles
  add constraint profiles_handle_format
  check (handle is null or handle ~ '^[a-zA-Z][a-zA-Z0-9_-]{1,31}$');

-- RPC: mark the current user as onboarded with a chosen display name + handle.
-- Single atomic update, runs as the caller (RLS still applies — caller can
-- only update their own row by policy).
create or replace function public.complete_onboarding(
  _display_name text,
  _handle text default null
)
returns public.profiles
language plpgsql
security invoker
set search_path = public
as $$
declare
  _row public.profiles%rowtype;
begin
  if _display_name is null or length(btrim(_display_name)) = 0 then
    raise exception 'display_name_required';
  end if;

  update public.profiles
  set
    display_name = btrim(_display_name),
    handle       = nullif(btrim(_handle), ''),
    onboarded_at = coalesce(onboarded_at, now())
  where id = auth.uid()
  returning * into _row;

  if not found then
    raise exception 'profile_not_found';
  end if;

  return _row;
end;
$$;

revoke all on function public.complete_onboarding(text, text) from public;
grant execute on function public.complete_onboarding(text, text) to authenticated;
