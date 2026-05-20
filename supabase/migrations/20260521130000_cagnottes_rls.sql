-- supabase/migrations/20260521130000_cagnottes_rls.sql
--
-- RLS + view-RPCs for the cagnotte tables created in 20260521120000.
-- Privacy invariant: honoree blind to cagnotte status (extends the
-- existing claims-blind via is_honoree_of_item helper from Phase 1).
-- Contribution amounts masked: visible to self + coordinator only.

alter table public.cagnottes enable row level security;
alter table public.cagnotte_contributions enable row level security;
alter table public.mangopay_users enable row level security;

-- ── cagnottes ─────────────────────────────────────────────────────
create policy cagnottes_select
  on public.cagnottes for select
  using (
    not public.is_honoree_of_item(item_id)
    and public.can_see_item(item_id)
  );

create policy cagnottes_insert
  on public.cagnottes for insert
  with check (
    coordinator_id = auth.uid()
    and not public.is_honoree_of_item(item_id)
    and public.can_see_item(item_id)
  );

create policy cagnottes_update
  on public.cagnottes for update
  using (coordinator_id = auth.uid())
  with check (coordinator_id = auth.uid());

-- ── cagnotte_contributions ─────────────────────────────────────────
-- No direct SELECT from clients. RPC get_cagnotte_view returns the
-- right shape per caller (mask amounts for non-coordinator/non-self).
-- INSERT is service-role-only (cagnotte-contribute Edge Function in Phase 4).
-- UPDATE blocked entirely from client (only webhook handler updates).
-- (No policies created = RLS denies all client access)

-- ── mangopay_users — self only ────────────────────────────────────
create policy mangopay_users_select
  on public.mangopay_users for select
  using (user_id = auth.uid());

create policy mangopay_users_insert
  on public.mangopay_users for insert
  with check (user_id = auth.uid());

create policy mangopay_users_update
  on public.mangopay_users for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── get_cagnotte_view RPC ──────────────────────────────────────────
-- Caller-dependent masking: contribution amounts visible only to self
-- + coordinator. Plain SELECT on cagnotte_contributions is blocked
-- entirely; this RPC is the only read path.
create or replace function public.get_cagnotte_view(_cagnotte_id uuid)
returns jsonb language plpgsql security definer
set search_path = public
stable
as $$
declare
  _caller uuid := auth.uid();
  _cagnotte record;
  _is_coordinator boolean;
  _is_honoree boolean;
  _can_see boolean;
begin
  select * into _cagnotte from cagnottes where id = _cagnotte_id;
  if not found then
    raise exception 'cagnotte_not_found';
  end if;

  _is_honoree := is_honoree_of_item(_cagnotte.item_id);
  _can_see := can_see_item(_cagnotte.item_id);
  if _is_honoree or not _can_see then
    raise exception 'cagnotte_forbidden';
  end if;

  _is_coordinator := (_cagnotte.coordinator_id = _caller);

  return jsonb_build_object(
    'cagnotte', row_to_json(_cagnotte),
    'is_coordinator', _is_coordinator,
    'contributions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'contributor_id', c.contributor_id,
        'contributor_name', p.display_name,
        'amount_cents', case
          when _is_coordinator or c.contributor_id = _caller then c.amount_cents
          else null
        end,
        'status', c.status,
        'created_at', c.created_at
      ) order by c.created_at desc)
      from cagnotte_contributions c
      join profiles p on p.id = c.contributor_id
      where c.cagnotte_id = _cagnotte_id and c.status in ('succeeded','pending')
    ), '[]'::jsonb)
  );
end; $$;
grant execute on function public.get_cagnotte_view(uuid) to authenticated;

-- ── get_my_cagnottes RPC — coordinator dashboard ──────────────────
-- Returns the caller's cagnottes (where they are coordinator),
-- sorted: open first (by deadline asc), then released, then refunded/cancelled.
create or replace function public.get_my_cagnottes()
returns jsonb language plpgsql security definer
set search_path = public
stable
as $$
declare _caller uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'cagnotte', row_to_json(c),
      'item', jsonb_build_object(
        'id', i.id, 'title', i.title, 'cover_url', i.cover_url
      ),
      'event', case when e.id is not null then jsonb_build_object(
        'id', e.id, 'title', e.title, 'kind', e.kind, 'occurs_on', e.occurs_on,
        'honoree_display', coalesce(p.display_name, e.honoree_name)
      ) else null end,
      'total_raised_cents', coalesce((
        select sum(amount_cents) from cagnotte_contributions
        where cagnotte_id = c.id and status = 'succeeded'
      ), 0),
      'contributor_count', coalesce((
        select count(*) from cagnotte_contributions
        where cagnotte_id = c.id and status = 'succeeded'
      ), 0)
    ) order by
      case c.status when 'open' then 0 when 'released' then 1 else 2 end,
      c.deadline asc)
    from cagnottes c
    join items i on i.id = c.item_id
    left join event_items ei on ei.item_id = c.item_id
    left join events e on e.id = ei.event_id
    left join profiles p on p.id = e.honoree_id
    where c.coordinator_id = _caller
  ), '[]'::jsonb);
end; $$;
grant execute on function public.get_my_cagnottes() to authenticated;
