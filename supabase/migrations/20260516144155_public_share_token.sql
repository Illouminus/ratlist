-- ============================================================================
-- Public view-only share — anonymous wishlist access via per-user token.
-- ============================================================================
-- Lets a rat hand out a URL like /share/<token> that anyone can open
-- without an account. The page renders the user's items + title +
-- price + note + photo + url — read only. No claim, no edit, no
-- account, no membership check.
--
-- Wire-up:
--   profiles.share_token  — nullable text. NULL means share is off
--                           (default). Setting it on enables sharing;
--                           rotating it invalidates the old URL.
--   get_public_list(t)    — SECURITY DEFINER lookup by token; returns
--                           a minimal {profile, items} payload.
--   set_share_token(on)   — SECURITY DEFINER toggle: ON generates a
--                           fresh token, OFF clears it.
--
-- Privacy posture:
--   - Token is gen_random_bytes(18) → 144 bits of entropy, base64-
--     encoded. Not guessable, fine in a URL.
--   - Anonymous viewers see what the owner explicitly enabled — items
--     they own and have set status='active'. We deliberately do NOT
--     show claims (would leak who's planning what), priority (feels
--     personal), or the per-group publication set (private to owner).
--   - Rotating the token kills every previously-shared URL on the
--     next request. There's only one token per profile at a time —
--     no proliferation of stale URLs.
-- ============================================================================

alter table public.profiles
  add column if not exists share_token text unique;

-- ─────────────────────────── set_share_token ───────────────────────────

create or replace function public.set_share_token(_enabled boolean)
returns text
language plpgsql
security definer
-- Include `extensions` on search_path so pgcrypto's gen_random_bytes
-- resolves without a schema-qualified call. Same pattern as elsewhere
-- in the schema where we generate tokens.
set search_path = public, extensions
as $$
declare
  _caller uuid := auth.uid();
  _token  text;
begin
  if _caller is null then
    raise exception 'not_authenticated';
  end if;

  if _enabled then
    -- Always regenerate when enabling. If sharing is currently off
    -- we get a fresh token; if it's on we treat the call as a
    -- "rotate" and invalidate the previous URL.
    _token := encode(gen_random_bytes(18), 'base64');
    -- base64 includes '/' and '+' which are URL-noisy; swap for
    -- URL-safe variants. We keep '=' padding-free by trimming.
    _token := translate(_token, '+/=', '-_');
    update public.profiles set share_token = _token where id = _caller;
  else
    update public.profiles set share_token = null where id = _caller;
    _token := null;
  end if;

  return _token;
end;
$$;

revoke all     on function public.set_share_token(boolean) from public;
grant  execute on function public.set_share_token(boolean) to authenticated;

-- ─────────────────────────── get_public_list ───────────────────────────

-- Custom return types let us bundle owner + items in a single call.
-- Wrapped in a DO block so the migration is re-runnable in dev (CREATE
-- TYPE has no IF NOT EXISTS).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'public_owner' and typnamespace = 'public'::regnamespace) then
    create type public.public_owner as (
      display_name text,
      handle       text,
      avatar_url   text
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'public_item' and typnamespace = 'public'::regnamespace) then
    create type public.public_item as (
      id          uuid,
      title       text,
      maker       text,
      url         text,
      price_text  text,
      occasion    text,
      note        text,
      cover_url   text,
      created_at  timestamptz
    );
  end if;
end;
$$;

create or replace function public.get_public_list(_token text)
returns table (
  owner public.public_owner,
  items public.public_item[]
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  _owner_id  uuid;
  _profile   public.profiles%rowtype;
  _items     public.public_item[];
begin
  if _token is null or _token = '' then
    raise exception 'invite_not_found';  -- reuse the same error code path
  end if;

  select id into _owner_id from public.profiles where share_token = _token;
  if _owner_id is null then
    raise exception 'invite_not_found';
  end if;

  select * into _profile from public.profiles where id = _owner_id;

  select coalesce(
           array_agg(
             row(
               i.id,
               i.title,
               i.maker,
               i.url,
               i.price_text,
               i.occasion,
               i.note,
               i.cover_url,
               i.created_at
             )::public.public_item
             order by i.created_at desc
           ),
           '{}'::public.public_item[]
         )
    into _items
  from public.items i
  where i.owner_id = _owner_id
    and i.status   = 'active';

  return query
  select
    row(_profile.display_name, _profile.handle, _profile.avatar_url)::public.public_owner,
    _items;
end;
$$;

-- Anonymous reads are the point — grant execute to both the anon and
-- authenticated roles. The function itself enforces the token check.
revoke all     on function public.get_public_list(text) from public;
grant  execute on function public.get_public_list(text) to anon, authenticated;
