-- ────────────────────────────────────────────────────────────
-- Helper: are two users friends? Used by RLS policies and RPCs.
-- SECURITY DEFINER so RLS on friendships doesn't recursively call
-- back into this function.
-- ────────────────────────────────────────────────────────────
create or replace function public.are_friends(_a uuid, _b uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where (user_a, user_b) = (least(_a, _b), greatest(_a, _b))
  );
$$;

grant execute on function public.are_friends(uuid, uuid) to authenticated, anon;

-- ────────────────────────────────────────────────────────────
-- create_friend_invite(_email, _message?) — generates token, upserts
-- on (from_user, to_email). Caller becomes from_user. Returns token.
-- ────────────────────────────────────────────────────────────
create or replace function public.create_friend_invite(
  _email   text,
  _message text default null
)
returns text
language plpgsql security definer
-- `extensions` on search_path so pgcrypto's gen_random_bytes resolves
-- unqualified (the extension lives in the extensions schema).
set search_path = public, extensions
as $$
declare
  caller uuid := auth.uid();
  new_token text;
  normalized_email text := lower(trim(_email));
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;
  if normalized_email = '' or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email';
  end if;
  new_token := encode(gen_random_bytes(24), 'hex');

  insert into public.friend_invites (token, from_user, to_email, message)
  values (new_token, caller, normalized_email, _message)
  on conflict (from_user, to_email) do update
    set token       = excluded.token,
        message     = excluded.message,
        created_at  = now(),
        accepted_at = null;  -- re-arm if previously accepted

  return new_token;
end;
$$;

grant execute on function public.create_friend_invite(text, text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- accept_friend_invite(_token) — caller must own the to_email.
-- ────────────────────────────────────────────────────────────
create or replace function public.accept_friend_invite(_token text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_email text;
  inv record;
  lo uuid;
  hi uuid;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;
  select email into caller_email from auth.users where id = caller;
  if caller_email is null then
    raise exception 'no_email';
  end if;
  caller_email := lower(caller_email);

  select token, from_user, to_email, accepted_at into inv
  from public.friend_invites
  where token = _token;
  if not found then
    raise exception 'token_not_found';
  end if;
  if inv.accepted_at is not null then
    raise exception 'already_accepted';
  end if;
  if inv.from_user = caller then
    raise exception 'self_invite';
  end if;
  if lower(inv.to_email) != caller_email then
    raise exception 'email_mismatch';
  end if;

  lo := least(inv.from_user, caller);
  hi := greatest(inv.from_user, caller);
  insert into public.friendships (user_a, user_b)
  values (lo, hi)
  on conflict do nothing;

  update public.friend_invites set accepted_at = now() where token = _token;
  return inv.from_user;
end;
$$;

grant execute on function public.accept_friend_invite(text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- rotate_add_me_token() — generate new token for caller's profile.
-- ────────────────────────────────────────────────────────────
create or replace function public.rotate_add_me_token()
returns text
language plpgsql security definer
-- `extensions` on search_path so pgcrypto's gen_random_bytes resolves
-- unqualified (the extension lives in the extensions schema).
set search_path = public, extensions
as $$
declare
  caller uuid := auth.uid();
  new_token text;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;
  new_token := encode(gen_random_bytes(16), 'hex');
  update public.profiles set add_me_token = new_token where id = caller;
  return new_token;
end;
$$;

grant execute on function public.rotate_add_me_token() to authenticated;

-- ────────────────────────────────────────────────────────────
-- accept_add_me(_token) — lookup profile by add_me_token, insert
-- friendship if not self. Returns the profile owner's id.
-- ────────────────────────────────────────────────────────────
create or replace function public.accept_add_me(_token text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_id uuid;
  lo uuid;
  hi uuid;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;
  select id into owner_id from public.profiles where add_me_token = _token;
  if not found then
    raise exception 'token_not_found';
  end if;
  if owner_id = caller then
    raise exception 'self_link';
  end if;
  lo := least(owner_id, caller);
  hi := greatest(owner_id, caller);
  insert into public.friendships (user_a, user_b)
  values (lo, hi)
  on conflict do nothing;
  return owner_id;
end;
$$;

grant execute on function public.accept_add_me(text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- unfriend(_other) — symmetric DELETE on the canonical pair.
-- ────────────────────────────────────────────────────────────
create or replace function public.unfriend(_other uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;
  if _other = caller then
    raise exception 'self_unfriend';
  end if;
  delete from public.friendships
  where (user_a, user_b) = (least(caller, _other), greatest(caller, _other));
end;
$$;

grant execute on function public.unfriend(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────
-- get_friends() — caller's friends as profile rows.
-- ────────────────────────────────────────────────────────────
create or replace function public.get_friends()
returns table (
  id           uuid,
  display_name text,
  handle       text,
  avatar_url   text,
  updated_at   timestamptz
)
language sql stable security definer
set search_path = public
as $$
  with my_edges as (
    select case when user_a = auth.uid() then user_b else user_a end as friend_id
    from public.friendships
    where user_a = auth.uid() or user_b = auth.uid()
  )
  select p.id, p.display_name, p.handle, p.avatar_url, p.updated_at
  from my_edges
  join public.profiles p on p.id = my_edges.friend_id
  order by p.display_name nulls last, p.id;
$$;

grant execute on function public.get_friends() to authenticated;

-- ────────────────────────────────────────────────────────────
-- get_friend_list(_friend_id, _category?) — friend's items visible
-- to the caller. Returns 0 rows if not friends.
-- ────────────────────────────────────────────────────────────
create or replace function public.get_friend_list(
  _friend_id uuid,
  _category  text default null
)
returns setof public.items
language sql stable security definer
set search_path = public
as $$
  select i.*
  from public.items i
  where i.owner_id = _friend_id
    and i.visibility in ('friends', 'public')
    and public.are_friends(_friend_id, auth.uid())
    and (_category is null or lower(i.category) = lower(_category));
$$;

grant execute on function public.get_friend_list(uuid, text) to authenticated;
