-- ============================================================================
-- Account self-management — GDPR right-to-erasure + right-to-portability
-- ============================================================================
-- delete_my_account: cascading account deletion. Re-homes any group the
--   caller created so the group stays admin'd, then deletes the auth.users
--   row — `on delete cascade` on profiles pulls down everything else.
--
-- export_my_data: returns one JSONB blob with everything the caller owns
--   or contributed. Intentionally excludes claims on the caller's own items
--   (privacy invariant — owners must never see who claimed what, even via
--   a self-export).
--
-- Storage cleanup (avatars, item covers) is NOT handled here — Storage is
-- not in the FK graph. A future Edge Function wrapper will call this RPC
-- and then delete `<user_id>/*` from the avatars/items buckets with the
-- service role.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- delete_my_account
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _blocked text[];
begin
  if _user_id is null then
    raise exception 'not_authenticated';
  end if;

  -- Pre-flight: refuse if the caller is the sole admin of any group that
  -- has other members. They must promote another admin first, or kick
  -- everyone, before deleting.
  select array_agg(g.name)
    into _blocked
    from public.groups g
   where exists (
           select 1 from public.group_members
            where group_id = g.id and user_id = _user_id and role = 'admin'
         )
     and (
           select count(*) from public.group_members
            where group_id = g.id and role = 'admin'
         ) = 1
     and exists (
           select 1 from public.group_members
            where group_id = g.id and user_id <> _user_id
         );

  if _blocked is not null then
    raise exception 'sole_admin_of_groups: %', array_to_string(_blocked, ', ');
  end if;

  -- Drop santa events I organised (cascade clears participants, exclusions,
  -- assignments). We don't try to re-home santa events — they're tied to a
  -- specific organiser, abandoning is fine.
  delete from public.santa_events where created_by = _user_id;

  -- Re-home groups I created. Pick the oldest remaining admin as the new
  -- created_by. The sole-admin pre-flight above guarantees this admin exists
  -- whenever the group has other members.
  update public.groups g
     set created_by = (
           select gm.user_id
             from public.group_members gm
            where gm.group_id = g.id
              and gm.user_id <> _user_id
              and gm.role = 'admin'
            order by gm.joined_at
            limit 1
         )
   where g.created_by = _user_id
     and exists (
           select 1 from public.group_members
            where group_id = g.id
              and user_id <> _user_id
              and role = 'admin'
         );

  -- Anything still pointing at me must be a group with no other members at
  -- all (the pre-flight already excluded "has-members-but-no-other-admin").
  -- Cascade-delete those.
  delete from public.groups g
   where g.created_by = _user_id;

  -- The pre-flight check is racy against concurrent group_members changes.
  -- If a member joined a now-deleted group between the pre-flight and the
  -- updates above, we may have orphaned them. Postgres' `delete from groups`
  -- on the previous line cascades down to group_members for any group I
  -- still owned, so the orphan case is "I was the lone admin of an empty
  -- group" — already handled by the delete-on-no-other-members branch.

  -- Finally cascade-delete the auth row. on_delete cascade on profiles
  -- pulls items → item_groups/photos/claims, group memberships, my claims,
  -- santa participation / assignments / exclusions.
  delete from auth.users where id = _user_id;
end;
$$;

revoke all     on function public.delete_my_account() from public;
grant  execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Self-service GDPR account deletion. Refuses with sole_admin_of_groups '
  'if the caller is the only admin of any group with other members. '
  'Storage cleanup (cover photos, avatars) must be done separately.';

-- ────────────────────────────────────────────────────────────────────────────
-- export_my_data
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.export_my_data()
returns jsonb
language sql stable security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) - 'id'
        from public.profiles p
       where p.id = auth.uid()
    ),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name',          g.name,
        'role',          gm.role,
        'joined_at',     gm.joined_at,
        'created_by_me', g.created_by = auth.uid()
      ) order by gm.joined_at)
        from public.group_members gm
        join public.groups g on g.id = gm.group_id
       where gm.user_id = auth.uid()
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title',      i.title,
        'maker',      i.maker,
        'url',        i.url,
        'price_text', i.price_text,
        'occasion',   i.occasion,
        'priority',   i.priority,
        'note',       i.note,
        'status',     i.status,
        'cover_url',  i.cover_url,
        'created_at', i.created_at,
        'updated_at', i.updated_at
      ) order by i.created_at)
        from public.items i
       where i.owner_id = auth.uid()
    ), '[]'::jsonb),
    'my_claims', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_title', i.title,
        'item_owner', p.display_name,
        'share',      c.share,
        'note',       c.note,
        'created_at', c.created_at
      ) order by c.created_at)
        from public.claims c
        join public.items i on i.id = c.item_id
        join public.profiles p on p.id = i.owner_id
       where c.user_id = auth.uid()
    ), '[]'::jsonb),
    'santa_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name',       e.name,
        'group_name', g.name,
        'role',       case
                        when e.created_by = auth.uid() then 'organiser'
                        else 'participant'
                      end,
        'gift_date',  e.gift_date,
        'status',     e.status,
        'created_at', e.created_at
      ) order by e.created_at)
        from public.santa_events e
        join public.groups g on g.id = e.group_id
       where e.created_by = auth.uid()
          or exists (
               select 1 from public.santa_participants sp
                where sp.event_id = e.id and sp.user_id = auth.uid()
             )
    ), '[]'::jsonb),
    'exported_at', to_jsonb(now())
  );
$$;

revoke all     on function public.export_my_data() from public;
grant  execute on function public.export_my_data() to authenticated;

comment on function public.export_my_data() is
  'Self-service GDPR data portability export. Deliberately excludes claims '
  'on the caller''s own items — owners must never see who claimed what.';
