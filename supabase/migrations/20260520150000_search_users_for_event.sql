-- supabase/migrations/20260520150000_search_users_for_event.sql
--
-- Adds search_users_for_event(text) — used by the CreateEventScreen
-- autocomplete when the creator picks "for someone else" (HR-mode).
--
-- Scope: only surfaces users the caller already shares at least one
-- group with, so you can't enumerate arbitrary app users by display
-- name (privacy invariant: a relationship must already exist).

create or replace function public.search_users_for_event(_q text)
returns table (id uuid, display_name text)
language sql security definer
set search_path = public
stable as $$
  select p.id, p.display_name
  from profiles p
  where p.id != auth.uid()
    and p.display_name ilike '%' || _q || '%'
    and shares_group_with(p.id)
  limit 8;
$$;

revoke all     on function public.search_users_for_event(text) from public;
grant  execute on function public.search_users_for_event(text) to authenticated;
