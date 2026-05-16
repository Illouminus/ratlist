-- ============================================================================
-- get_people() — users I share at least one group with.
-- ============================================================================
-- Used by the People screen to populate the directory of "rats I can see
-- wishlists of". Returns each peer once with the count of groups we share.
-- The caller is excluded from the result. SECURITY INVOKER so RLS on the
-- underlying tables still applies (and so this stays cheap to reason about).
-- ============================================================================

create or replace function public.get_people()
returns table (
  id                  uuid,
  display_name        text,
  handle              text,
  avatar_url          text,
  shared_group_count  bigint
)
language sql stable security invoker
set search_path = public
as $$
  select
    p.id,
    p.display_name,
    p.handle,
    p.avatar_url,
    count(distinct gm_them.group_id)::bigint as shared_group_count
  from public.profiles p
  join public.group_members gm_them
    on gm_them.user_id = p.id
  join public.group_members gm_me
    on gm_me.group_id = gm_them.group_id
   and gm_me.user_id  = auth.uid()
  where p.id <> auth.uid()
  group by p.id, p.display_name, p.handle, p.avatar_url
  order by p.display_name;
$$;

revoke all     on function public.get_people() from public;
grant  execute on function public.get_people() to authenticated;
