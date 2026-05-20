-- supabase/migrations/20260521120000_cagnottes.sql
--
-- Cagnotte data layer: per-item collective gifting with money in Mangopay escrow.
-- B2B differentiator for Phase 2 of the cagnotte rollout.
-- See docs/superpowers/specs/2026-05-20-cagnotte-design.md for full design.

create table public.cagnottes (
  id                    uuid primary key default gen_random_uuid(),
  item_id               uuid not null unique
                          references public.items(id) on delete cascade,
  coordinator_id        uuid not null references auth.users(id),
  goal_amount_cents     integer not null check (goal_amount_cents >= 500),
  currency              text not null default 'EUR' check (currency = 'EUR'),
  deadline              timestamptz not null,
  message               text,
  mangopay_wallet_id    text not null unique,
  status                text not null default 'open'
                          check (status in ('open','released','refunded','cancelled')),
  released_at           timestamptz,
  refund_initiated_at   timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index cagnottes_open_by_deadline_idx
  on public.cagnottes (deadline) where status = 'open';
create index cagnottes_coordinator_idx on public.cagnottes (coordinator_id);

create table public.cagnotte_contributions (
  id                    uuid primary key default gen_random_uuid(),
  cagnotte_id           uuid not null
                          references public.cagnottes(id) on delete cascade,
  contributor_id        uuid not null references auth.users(id),
  amount_cents          integer not null check (amount_cents >= 100),
  mangopay_payin_id     text not null unique,
  mangopay_refund_id    text,
  status                text not null default 'pending'
                          check (status in ('pending','succeeded','failed','refunded')),
  created_at            timestamptz not null default now()
);
create index cagnotte_contributions_cagnotte_status_idx
  on public.cagnotte_contributions (cagnotte_id, status);
create index cagnotte_contributions_contributor_idx
  on public.cagnotte_contributions (contributor_id);

create table public.mangopay_users (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  mangopay_user_id      text not null unique,
  kyc_level             text not null default 'NONE'
                          check (kyc_level in ('NONE','LIGHT','REGULAR')),
  bank_account_id       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- updated_at triggers (reuses existing set_updated_at function)
create trigger cagnottes_set_updated_at
  before update on public.cagnottes
  for each row execute function set_updated_at();
create trigger mangopay_users_set_updated_at
  before update on public.mangopay_users
  for each row execute function set_updated_at();

-- mutual exclusion: cagnotte ↔ solo claim
create or replace function public.enforce_no_solo_claim_on_cagnotte_insert()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.claims where item_id = new.item_id) then
    raise exception 'item_has_solo_claim' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger cagnottes_check_no_claim
  before insert on public.cagnottes
  for each row execute function enforce_no_solo_claim_on_cagnotte_insert();

create or replace function public.enforce_no_open_cagnotte_on_claim_insert()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from public.cagnottes
    where item_id = new.item_id and status = 'open'
  ) then
    raise exception 'item_has_open_cagnotte' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger claims_check_no_open_cagnotte
  before insert on public.claims
  for each row execute function enforce_no_open_cagnotte_on_claim_insert();

-- item lock during open cagnotte (only honoree blocked; HR-creator can still edit)
create or replace function public.enforce_item_locked_during_open_cagnotte()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from public.cagnottes
    where item_id = old.id and status = 'open'
  ) and public.is_honoree_of_item(old.id) then
    raise exception 'item_locked' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger items_block_modify_during_cagnotte
  before update or delete on public.items
  for each row execute function enforce_item_locked_during_open_cagnotte();
