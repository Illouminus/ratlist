# Cagnotte — design spec

> **Status:** approved, ready for implementation plan
> **Date:** 2026-05-20
> **Owner:** Edouard + Claude
> **Strategic context:** [STRATEGY.md](../../../STRATEGY.md) — cagnotte is the B2B
> hook for French enterprise (Danone, La Poste). This is the single biggest
> differentiator vs Leetchi / Le Pot Commun: nobody integrates wishlist with
> collective gifting payments today.
> **Privacy context:** [CLAUDE.md](../../../CLAUDE.md) — the "owner blind to
> claims" invariant extends to cagnotte. Re-verify the smoke-test matrix at
> the end of this spec after any RLS change.

---

## TL;DR

Per-item collective gifting. A friend or colleague picks an item from someone's
wishlist, opens a kitty against it, sets goal + deadline. Others contribute by
card; money sits in Mangopay escrow until the kitty creator (coordinator) clicks
"collect" and the payout lands in their bank account. Auto-refund on deadline
if no release. Honoree (the recipient) is **blind** to the kitty — same privacy
invariant as the existing claims model. HR-mode events let someone create the
event and curate the wishlist on behalf of a non-engaged honoree (retirement
party, parental leave, surprise birthday) — added to scope explicitly because
without it the demo to Danone PO has a visible hole.

## Scope

**In:**
- New tables `cagnottes` and `cagnotte_contributions`
- Mutual exclusion with the existing `claims` mechanism (an item has either a
  solo claim OR a cagnotte, never both)
- Real money flow via Mangopay (sandbox mode for MVP and demo; production
  switch after first pilot)
- LIGHT KYC for coordinators (no document uploads)
- HR-mode event creation: `events.created_by` separate from `events.honoree_id`;
  `honoree_id` becomes nullable; `honoree_name` text fallback for non-user
  honorees
- 6 new Edge Functions (create / contribute / release / cancel / webhook / sweep)
- 7 new email templates via Resend (using existing send-* pattern)
- New RLS policies on the new tables + extensions to `events` and `items` for
  HR-mode

**Out (deferred to Phase 2+ unless flagged sooner):**
- REGULAR KYC (document upload) — triggered only after €2,500 lifetime payout
  per coordinator, not needed for first pilots
- Multi-currency — EUR only for MVP
- Coordinator transfer (one person hands the role to another mid-flow)
- Partial release (all or nothing for now)
- Anonymous contributions
- Recurring contributions
- Notification preferences integration — depends on the existing
  `PUBLIC_LAUNCH.md` notif-prefs roadmap item landing; for MVP all cagnotte
  emails fire unconditionally
- B2B-tier UI (admin dashboard, white-label, SSO) — see STRATEGY.md "/teams"
  SKU notes
- Withdraw mid-cagnotte (contributor changes mind before deadline) —
  refund-only via cancellation, not partial withdraw

## Design decisions (locked)

Captured from the brainstorming dialogue 2026-05-20. Each was a deliberate
choice with discussed alternatives; the alternatives are recorded so future
agents can see why we didn't pick them.

| # | Decision | Alternative rejected |
| - | -------- | -------------------- |
| 1 | Cagnotte attaches to a **single item** (per-item granularity) | Event-pool (Leetchi-clone, no wishlist integration); hybrid both-modes (UI complexity, no payoff for MVP) |
| 2 | Cagnotte and solo claim are **mutually exclusive** per item | Cagnotte upgrades claim (consent friction); parallel both at once (refund logic explodes) |
| 3 | Honoree is **blind** to cagnotte status (same as claims) | Progress-only visibility (breaks invariant); full visibility (kills the surprise); per-item opt-in (extra setting + extra RLS path) |
| 4 | Coordinator = **any audience member** who initiates (not honoree) | Event-organiser-only (blocks "I want to organise on someone else's event" — common); initiator-picks-coordinator (extra UI step, MVP YAGNI) |
| 5 | MVP supports **creator ≠ honoree** (HR-mode events) | Honoree-owned only (covers self-birthday but blanks retirement / parental-leave / surprise-anything = ~50% of B2B scenarios) |
| 6 | Money **charged immediately on commit**, escrow until release | Card-auth-hold (7-day max auth doesn't cover 2-3 week kitties); track-only (no real money — kills the demo) |
| 7 | **Mangopay** as payment provider | Stripe Connect (worse fit for pot-commun, less FR credibility); Stripe vanilla (we'd be the merchant, illegal without e-money license in EU) |
| 8 | **Coordinator clicks "collect"** to release; **auto-refund on deadline** if no release | Auto-release at 100% (premature, doesn't match real cagnotte flow); deadline-only release (blocks early collect) |
| 9 | Contributor visibility: **names yes, amounts no** (except to self + coordinator) | Full transparency (awkward — "why €10 vs €50?"); fully anonymous (kills social proof) |
| 10 | EUR-only currency for MVP | Multi-currency (added FX complexity for zero MVP demand) |

## Data model

### Schema additions

```sql
-- migration 20260520xxxxxx_cagnottes.sql

-- 1. events extension: creator ≠ honoree
alter table public.events
  add column created_by uuid references auth.users(id) not null
    default auth.uid(),
  alter column honoree_id drop not null,
  add column honoree_name text;
-- backfill: existing events have created_by = honoree_id
update public.events set created_by = honoree_id where created_by is null;
-- check that at least one of honoree_id / honoree_name is set
alter table public.events
  add constraint events_honoree_identified
    check (honoree_id is not null or honoree_name is not null);

-- 2. cagnottes — one per item
create table public.cagnottes (
  id                    uuid primary key default gen_random_uuid(),
  item_id               uuid not null unique
                          references public.items(id) on delete cascade,
  coordinator_id        uuid not null references auth.users(id),
  goal_amount_cents     integer not null check (goal_amount_cents >= 500),
  currency              text not null default 'EUR' check (currency = 'EUR'),
  deadline              timestamptz not null check (deadline > now()),
  message               text,                         -- optional coordinator note
  mangopay_wallet_id    text not null unique,
  status                text not null default 'open'
                          check (status in ('open','released','refunded','cancelled')),
  released_at           timestamptz,
  refund_initiated_at   timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on public.cagnottes (deadline) where status = 'open';
create index on public.cagnottes (coordinator_id);

-- 3. cagnotte_contributions — one row per pay-in
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
create index on public.cagnotte_contributions (cagnotte_id, status);
create index on public.cagnotte_contributions (contributor_id);

-- 4. mangopay users table (separate to keep auth.users clean)
create table public.mangopay_users (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  mangopay_user_id      text not null unique,
  kyc_level             text not null default 'NONE'
                          check (kyc_level in ('NONE','LIGHT','REGULAR')),
  bank_account_id       text,    -- mangopay BankAccount.Id for payouts
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- 5. honoree-blind helper (extension required by HR-mode)
-- The existing owns_item(item_id) is honoree-equivalent ONLY in self-events
-- (where items.owner_id = honoree). With creator≠honoree in scope, the gate
-- must shift to "is caller the honoree of the gift?", not "is caller the
-- owner of the item record?"
create or replace function public.is_honoree_of_item(_item_id uuid)
returns boolean language plpgsql security definer
set search_path = public as $$
declare _has_events boolean;
begin
  select exists(select 1 from event_items where item_id = _item_id)
    into _has_events;
  if _has_events then
    -- event-attached item: honoree-ness gated by event.honoree_id
    return exists (
      select 1 from event_items ei
      join events e on e.id = ei.event_id
      where ei.item_id = _item_id
        and e.honoree_id = auth.uid()
    );
  else
    -- list-only item: legacy = item owner is the honoree
    return exists (
      select 1 from items
      where id = _item_id and owner_id = auth.uid()
    );
  end if;
end; $$;
```

**Cascading fix to existing `claims.SELECT`:** the current policy
`not owns_item(item_id) and can_see_item(item_id)` is correct only in
self-events. Update to use the new helper:

```sql
drop policy claims_select on public.claims;
create policy claims_select
  on public.claims for select
  using (
    not public.is_honoree_of_item(item_id)
    and public.can_see_item(item_id)
  );
```

In self-event scenarios `is_honoree_of_item` returns the same value as the
old `owns_item` for the same caller, so today's behaviour is preserved. HR-mode
gets correct semantics.

### Mutual exclusion (claim ↔ cagnotte) via triggers

```sql
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
```

Both errors map to new strings in `lib/errors.ts`:
- `itemHasSoloClaim` → "Someone has already claimed this item. Cagnotte can't start."
- `itemHasOpenCagnotte` → "A kitty is already running for this item. Can't claim solo."

### Item-lock during active cagnotte

```sql
create or replace function public.enforce_item_locked_during_open_cagnotte()
returns trigger language plpgsql as $$
begin
  -- only block when the caller is the honoree of the gift. HR-creator editing
  -- their own (HR-mode) item during a cagnotte is fine — they're not the
  -- recipient, no surprise to preserve from them.
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
```

Error `item_locked` → generic "This item can't be modified right now" in UI
(generic on purpose — honoree mustn't infer there's a cagnotte). In self-events
honoree = item owner, so the existing UPDATE/DELETE path hits this. In HR-mode
honoree never owns the item, so RLS already blocks them before the trigger fires;
the `is_honoree_of_item` check here is belt-and-braces for any future RLS change.

### Coordinator constraints

`coordinator_id` enforced via INSERT trigger (or RLS check):
- **Must not be the honoree** of the cagnotte's gift, i.e.
  `not is_honoree_of_item(item_id)` evaluated for the coordinator user.
  In HR-mode, items.owner_id ≠ honoree, so checking item owner is wrong —
  the helper correctly looks through `event_items → events.honoree_id`
- Must be able to see the item (`can_see_item(item_id)` from coordinator's
  perspective). Enforced at the Edge Function (`cagnotte-create`) layer
  rather than DB trigger to avoid SECURITY DEFINER search_path complications
- In HR-mode, HR can be the coordinator (HR ≠ honoree). In self-mode, friend
  starting the cagnotte is the coordinator (friend ≠ honoree). Both natural

## State machine

```
                  ┌─────────────────────────────────────────┐
                  │                  open                   │
                  │  (contributions accepted)               │
                  └────┬──────────────┬──────────────┬──────┘
   coordinator         │              │              │ coordinator
   clicks              │              │ deadline     │ cancels
   "collect"           │              │ passed       │ (only if 0 succeeded
                      ▼               │ no release   │  contributions)
              ┌───────────┐           │              ▼
              │ released  │           │       ┌────────────┐
              └───────────┘           │       │ cancelled  │
                                      │       └────────────┘
                                      ▼
                              ┌───────────┐
                              │ refunded  │  (cron-sweep triggers)
                              └───────────┘
```

Terminal states. After `released` / `refunded` / `cancelled` nothing changes.

## Privacy / RLS

### `cagnottes` table

```sql
alter table public.cagnottes enable row level security;

-- SELECT: same paradigm as updated claims — visible to audience, hidden from honoree.
-- is_honoree_of_item (not owns_item) is the correct gate now that HR-mode exists.
create policy cagnottes_select
  on public.cagnottes for select
  using (
    not public.is_honoree_of_item(item_id)
    and public.can_see_item(item_id)
  );

-- INSERT: audience-member-not-honoree
create policy cagnottes_insert
  on public.cagnottes for insert
  with check (
    coordinator_id = auth.uid()
    and not public.is_honoree_of_item(item_id)
    and public.can_see_item(item_id)
  );

-- UPDATE: only by coordinator, and only state field
create policy cagnottes_update
  on public.cagnottes for update
  using (coordinator_id = auth.uid());

-- DELETE: nobody from client (only Edge Function on cascade-cleanup)
```

### `cagnotte_contributions` table

Per-row visibility logic is too nuanced for pure RLS (amounts mask depends on
caller). Approach: **client cannot SELECT directly**. RLS blocks all SELECT.
A SECURITY DEFINER RPC returns the right shape per caller:

```sql
create or replace function public.get_cagnotte_view(_cagnotte_id uuid)
returns jsonb language plpgsql security definer
set search_path = public as $$
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
  -- visibility check — is_honoree_of_item handles both self-events
  -- (owner=honoree) and HR-events (owner=creator, honoree separate)
  _is_honoree := is_honoree_of_item(_cagnotte.item_id);
  _can_see := can_see_item(_cagnotte.item_id);
  if _is_honoree or not _can_see then
    raise exception 'cagnotte_forbidden';
  end if;
  _is_coordinator := (_cagnotte.coordinator_id = _caller);
  return jsonb_build_object(
    'cagnotte', row_to_json(_cagnotte),
    'contributions', (
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
      ))
      from cagnotte_contributions c
      join profiles p on p.id = c.contributor_id
      where c.cagnotte_id = _cagnotte_id and c.status in ('succeeded','pending')
      order by c.created_at desc
    )
  );
end; $$;
```

### `items` RLS extension for HR-mode

Existing `items` SELECT policy has three OR'd paths (owner / item_groups /
event_circles via M2 redesign). HR-mode introduces items where `owner_id =
HR_user` — the event_circles path already covers audience visibility, so no
new policy needed. But: **HR's own `MyListScreen` should NOT show items they
created for HR-events** (they'd pollute the personal list). Add a filter at the
hook level (`useMyItems`):

```sql
-- pseudo-filter at the useMyItems RPC layer
select * from items
where owner_id = auth.uid()
  and not exists (
    select 1 from event_items ei
    join events e on e.id = ei.event_id
    where ei.item_id = items.id
      and e.created_by = auth.uid()
      and e.honoree_id is distinct from auth.uid()
  );
```

I.e. exclude items that the user added to events they're hosting for someone
else.

### Privacy smoke-test matrix (P0)

Before merging, re-verify these via psql/REST with per-user JWTs. Tests cover
both self-event mode (today's path) and HR-mode (new in this spec).

**Self-event mode** (honoree = item owner = event creator):

| Caller | Surface | Expected |
| ------ | ------- | -------- |
| Honoree | `get_cagnotte_view(own_item_cagnotte_id)` | `cagnotte_forbidden` |
| Honoree | `select * from cagnottes where item_id = own_item_id` | `[]` |
| Honoree | `select * from claims where item_id = own_item_id` | `[]` (existing invariant) |
| Honoree | `update items set title=... where id = own_item_with_open_cagnotte` | `item_locked` |
| Audience-member | `get_cagnotte_view(...)` | full row; contributor names visible; amounts null except own |
| Coordinator | `get_cagnotte_view(...)` | full row; ALL contributor amounts visible |
| Contributor | `get_cagnotte_view(...)` | own amount visible; others' amounts null |
| Non-audience | `get_cagnotte_view(...)` | `cagnotte_forbidden` |

**HR-event mode** (items.owner_id = HR_creator, events.honoree_id = Jean):

| Caller | Surface | Expected |
| ------ | ------- | -------- |
| Jean (honoree) | `get_cagnotte_view(...)` | `cagnotte_forbidden` |
| Jean | `select * from cagnottes where item_id = ...` | `[]` |
| Jean | `select * from claims where item_id = ...` | `[]` — **new invariant from this spec** |
| HR (creator) | `get_cagnotte_view(...)` | full row, sees as audience-member |
| HR | `select * from claims where item_id = ...` | sees existing claims (HR is curator, not honoree) |
| HR coordinator | `get_cagnotte_view(...)` | full row; ALL amounts visible (HR is coordinator) |
| HR | `update items set title=... where id = HR_owned_item_with_cagnotte` | succeeds (HR ≠ honoree, can edit during cagnotte) |
| Other colleague (audience) | `get_cagnotte_view(...)` | full row; amounts null except own |

**HR-event with non-user honoree** (honoree_id is NULL, honoree_name = "Jean"):

| Caller | Surface | Expected |
| ------ | ------- | -------- |
| HR | `get_cagnotte_view(...)` | full row, as audience |
| Audience member | `get_cagnotte_view(...)` | full row; amounts null except own |
| (no honoree query path exists — Jean is not a user) | — | — |

## Mangopay integration

### Money flow

1. **First-time coordinator action:** KYC LIGHT collect (name, DOB, nationality,
   country, IBAN) → create Mangopay User → store mangopay_user_id +
   bank_account_id in `mangopay_users`
2. **Open cagnotte:** create Mangopay Wallet (currency=EUR, owner=platform) →
   store wallet_id on `cagnottes`
3. **Contribute:** Edge Function `cagnotte-contribute`
   - Ensure contributor has a Mangopay User (create lazily if first time)
   - Create PayIn (CardDirect, SecureMode=FORCE for PSD2)
   - Insert `cagnotte_contributions` row, status=pending
   - Return `SecureModeRedirectURL` to client
4. **3DS redirect:** client navigates to Mangopay's secure URL → user
   completes challenge → Mangopay redirects to
   `https://ratlist.app/cagnotte/<id>?status=succeeded`
5. **Webhook confirms:** `PayIn.SUCCEEDED` → update contribution status to
   `succeeded` → realtime push to UI → email coordinator
6. **Release:** Edge Function `cagnotte-release`
   - Transfer from cagnotte's wallet → coordinator's wallet (Mangopay internal)
   - PayOut from coordinator's wallet → coordinator's IBAN
   - Update `cagnottes.status='released'`, `released_at=now()`
7. **Refund on deadline:** Edge Function `cagnotte-sweep` (cron, 15-min interval)
   - Find `cagnottes` with `status='open' AND deadline < now()`
   - For each, iterate succeeded contributions → call Mangopay Refund
   - Update each contribution status to `refunded` as webhooks confirm
   - Update `cagnottes.status='refunded'`, `refund_initiated_at=now()`

### Edge Functions

Following the existing `send-santa-draw` pattern (`index.ts` does auth + lookup
+ Mangopay call; `_shared/` holds helpers; client invokes via
`supabase.functions.invoke()`):

| Function | Purpose |
| -------- | ------- |
| `mangopay-kyc-light` | Creates Mangopay User + LIGHT KYC + BankAccount on first cagnotte attempt |
| `cagnotte-create` | Creates Mangopay Wallet + `cagnottes` row |
| `cagnotte-contribute` | Creates PayIn + `cagnotte_contributions` row; returns 3DS URL |
| `cagnotte-release` | Transfers + PayOut; updates DB |
| `cagnotte-cancel` | Coordinator cancels (only if 0 succeeded contributions) |
| `mangopay-webhook` | Receives PayIn / PayOut / Refund events; HMAC-verified; idempotent |
| `cagnotte-sweep` | Cron-invoked; finds expired open cagnottes; initiates refunds |
| `send-cagnotte-*` | Email templates (7 total, see Email flows) |

### Sandbox vs production

ENV vars:
- `MANGOPAY_ENV` = `sandbox` | `production`
- `MANGOPAY_CLIENT_ID`, `MANGOPAY_API_KEY` per environment
- `MANGOPAY_WEBHOOK_SECRET` per environment

For MVP and Danone demo: sandbox. Real 3DS UX (the SMS challenge actually
shows), but no real charges. Test cards: `4970100000000154` (always success),
`4970100000000162` (always 3DS fail). Switch to production after first paid
pilot signed.

### State sync

DB is source of truth for status; Mangopay is source of truth for money. Sync
mechanism:
- Every Edge Function call updates DB row immediately after Mangopay API call
- `mangopay-webhook` is the ONLY path that moves status from `pending` to
  `succeeded` / `failed`
- Webhook idempotency: lookup by `mangopay_payin_id` / `mangopay_payout_id` /
  `mangopay_refund_id` (all unique-indexed)
- Reconciliation cron (nightly): for any DB row in `pending` state for >1h,
  pull Mangopay API state and sync

## UI surfaces

Mockups developed in the brainstorming companion (stored locally at
`.superpowers/brainstorm/...`, not committed). Summarised here as text so the
spec stands alone.

### Existing surfaces — minor extensions

- **`/i/:itemId` (item detail, audience view):** when an active cagnotte exists
  on the item, the existing "I'll get this" claim CTA is replaced by a
  cagnotte block: editorial progress indicator (hairline + terracotta dot,
  not a corporate progress bar), contributor names joined with `·`,
  primary CTA `contribute`, secondary text-link "see who's in". Marie's note
  about the item sits below as before
- **`/i/:itemId` (item detail, honoree view):** unchanged. Honoree never sees
  any cagnotte trace
- **`/i/:itemId` (audience view, no cagnotte yet):** two affordances —
  primary "I'll get this alone" (existing claim button), secondary small
  link "or start a kitty". Mutual exclusion enforced by API; UI explains
  on click if blocked
- **`/events/new` (event creation form):** new top-level toggle "**this event
  is for me / for someone else**". For "someone else": honoree selector
  (autocomplete over friends, with a free-text fallback "type a name" that
  sets `honoree_name` and leaves `honoree_id` null). Existing kind / date /
  audience / items pickers stay the same
- **HR-mode event detail:** creator sees the same edit affordances as a
  self-honoree does today; honoree sees nothing (because honoree_id+RLS
  blocks them, or honoree isn't even a user)

### New surfaces

- **KYC LIGHT modal** (first-time coordinator): paper-aesthetic modal with
  Caveat-marginalia section labels ("about you", "where the money lands"),
  underline-only inputs in the SketchInput style. Pre-fills first/last
  name + nationality from profile. Reassurance block at bottom citing
  Mangopay regulation + comparison to Leetchi/Le Pot Commun. Single CTA
  "confirm and continue", secondary "later" closes back to item-detail
- **Cagnotte creation form** (`/i/:itemId/cagnotte/new`): item-context block
  (thumb + title + price + "from {honoree}'s wishlist"), amount input
  pre-filled from item.price_max with edit, deadline picker with chip
  presets (`in 3 days` / `1 week` / `day before event` / `2 weeks`,
  defaults to event-date-minus-1-day), optional `message` textarea,
  reassurance bullets covering the three most common coordinator questions
  ("what if not enough?", "can I release early?", "what if I miss the
  deadline?"). CTA "open the kitty"
- **Coordinator dashboard** (`/cagnottes` or under `/settings/cagnottes`):
  list of cagnottes the current user coordinates, grouped by status. Hint
  banner at top highlighting any "ready to collect" cagnotte. Per-card:
  item thumb + title + honoree + compact progress + status pill. Primary
  CTA per card scales: `collect €X` (terracotta when goal hit, ink when
  partial), secondary `remind contributors` or `see contributors`. Tail
  marker + rat doodle at end of list
- **Contribute flow** (modal on item-detail or short page): amount input
  (free EUR amount, server validates ≥ €1), optional ladder of preset
  chips (`€10` / `€20` / `€50`), "this is your first contribution" note
  for unfamiliar contributors, submit → redirects to Mangopay 3DS →
  redirects back with success state

### Design constraints

- Editorial paper aesthetic preserved everywhere (paper, ink, terracotta,
  hairlines, Newsreader italic for display, Public Sans for body, Caveat
  for marginalia). No corporate progress bars, no shadows, no rounded
  cards with drop-shadow
- Hand-drawn rats stay in margins; don't strip them for "professionalism"
  even in B2B/HR-mode flows
- All copy in EN first (strategy pivot 2026-05-19 puts EN as primary).
  FR-localisation lands in Phase D of the launch sequence per STRATEGY.md

## Edge cases (error handling)

See Section 4 of the brainstorm session for full table. Key invariants:

- Honoree edit/delete of cagnotte-locked item: generic `item_locked` error,
  no reason leaked
- Two simultaneous "Start cagnotte" on same item: DB UNIQUE constraint
  wins, second client sees friendly "already started" toast
- Coordinator account deletion with open cagnottes: blocked at
  `delete_my_account` RPC level until cagnottes released or cancelled
- PayOut failure (bad IBAN, bank reject): status stays `released` but
  `payout_failed_at` flagged; coordinator emailed; money waits in Mangopay
  wallet until they update bank account
- Refund failure (expired card): Sentry alert, manual operator
  intervention via bank transfer outside Mangopay
- Webhook race conditions: idempotent on `mangopay_*_id`; reconciliation
  cron catches missed events

## Email flows

All via Resend, pattern `send-cagnotte-*` Edge Functions. Templates use the
existing paper-ink-accent brand style (same as `send-santa-draw` templates).

| Trigger | Recipient | Subject (EN) |
| ------- | --------- | ------------ |
| Cagnotte created | Event audience minus creator | "A kitty just opened for {honoree}'s {item}" |
| Contribution succeeded | Coordinator | "{contributor} chipped in for {item}" |
| Goal reached | Coordinator | "Your kitty for {item} is fully funded" |
| Deadline approaching (3d) | Coordinator | "Your kitty closes in 3 days" |
| Released | All contributors | "The {item} kitty was collected — thanks" |
| Refunded | All contributors | "Your {item} contribution was refunded" |
| Cancelled | All contributors | Same template as refunded with cancellation reason |

Honoree never receives any cagnotte-related email. Notification preference
toggle (per category) deferred to the existing roadmap item; for MVP all
emails fire unconditionally.

## Testing strategy

### Unit (RTL + Jest)
- State machine transitions (`cagnotteReducer`)
- `useCagnotte` / `useCoordinatorCagnottes` hooks
- Currency formatters (€ display, cents ↔ euros)
- Form validation (goal ≥ €5, deadline > now, IBAN syntax)

### Integration (psql + REST, per-user JWTs)
- The 7-row privacy smoke-test matrix above — **P0**
- Mutual exclusion trigger (insert solo claim then cagnotte should fail;
  vice versa)
- HR-mode visibility (creator ≠ honoree event flows)
- `get_cagnotte_view` RPC for each caller role
- `cagnotte-sweep` synthetic past-deadline cagnotte → status changes

### Edge function tests (Deno)
- `mangopay-webhook` HMAC verification (valid accepts, tampered rejects)
- Webhook idempotency (duplicate post is no-op)
- `cagnotte-contribute` flow with mocked Mangopay (success / 3DS / fail)
- `cagnotte-release` idempotency
- `cagnotte-sweep` finds correct rows

### E2E manual QA for demo
- Sandbox-mode Mangopay end-to-end: Sophie KYC → start cagnotte → 2 test
  users contribute (one success, one fail) → Sophie collects → check
  Mangopay dashboard for confirmation
- HR-mode rehearsal: HR creates event for non-user "Jean Dubois", adds
  items, 5 colleagues contribute, HR collects to her IBAN

## Migration order

Atomic commits to stay PR-reviewable:

1. **Schema migration** (events extension + cagnottes + cagnotte_contributions
   + mangopay_users + triggers + helper RPC). Apply locally, regen types
2. **RLS policies** + `get_cagnotte_view` RPC + privacy smoke-test matrix
   verified
3. **Mangopay client wrapper** in `app/src/lib/mangopay.ts` (typed wrapper
   over Mangopay's REST API)
4. **Edge Functions** in order: `mangopay-kyc-light`, `cagnotte-create`,
   `cagnotte-contribute`, `mangopay-webhook`, `cagnotte-release`,
   `cagnotte-cancel`, `cagnotte-sweep`
5. **Email templates** (`send-cagnotte-*` x 7) — last because tested via
   real flow rather than units
6. **UI** in order: KYC modal → cagnotte creation form → contribute flow →
   coordinator dashboard → item-detail integration → HR-mode event form
7. **i18n** (RU + EN coverage for all new strings; FR deferred to launch
   Phase D)
8. **Docs:** update CLAUDE.md feature-status table, ARCHITECTURE.md data
   model, STRATEGY.md cagnotte section ("decided" → "shipped")

## Open questions

These weren't blocking for the MVP design but should be decided during
implementation or before launch:

1. **Goal floor (€5) and contribution floor (€1):** sensible defaults from
   training data on cagnotte-des-collègues averages, but should validate
   with the Danone PO during demo discovery call
2. **Coordinator KYC at first cagnotte vs at release:** spec assumes "at
   cagnotte creation" (front-loaded). Trade-off: more friction upfront, but
   no surprise "you can't release because KYC missing" at the worst moment.
   Open if testing shows KYC-completion drop-off > 30%
3. **Contribute amount preset chips (€10 / €20 / €50):** UX call — does
   it speed up flow or feel patronising? A/B post-launch
4. **HR-mode: should the creator be auto-coordinator for cagnottes inside
   their event?** Currently spec says coordinator = any audience member.
   For HR scenarios, HR is usually the natural coordinator. UI could
   default the "start cagnotte" CTA to HR, but the model stays the same
5. **`coordinator_can_release_below_50_pct` flag:** if abused (release at
   5% then run with money), contributors look stupid. Confirmation dialog
   should help. Open: explicit % floor?
6. **Mangopay-side platform onboarding:** before production switch we need
   to complete Mangopay's KYC as a platform client (us, the platform —
   separate from per-coordinator KYC). Estimated 1-2 weeks elapsed. Schedule
   between launch Phase B (cagnotte ship) and Phase I (B2B pilots) per
   STRATEGY.md — must land before any real card is charged in production.
   Sandbox-only is fine for the Danone PO demo and all internal QA
7. **Edit / cancel cagnotte after contributions exist:** spec says cancel
   only if 0 contributions. What if 1 contributor wants to back out before
   deadline? For MVP, manual: contact coordinator → coordinator cancels →
   refunds to all. Self-service withdraw is Phase 2

## Pickup tips

- Privacy invariants are **non-negotiable**. The 7-row smoke-test matrix
  must pass before merge of every PR touching `cagnottes`,
  `cagnotte_contributions`, or any RLS on `events` / `items`
- The `forceExitAfterBuild` Vite plugin must stay last in plugins array
  (see PUBLIC_LAUNCH.md). Adding cagnotte's new lazy-loaded screens
  doesn't change this
- `_shared/` Edge Function pattern — copy the shape from `send-santa-draw`
- Mangopay's WOFF-vs-WOFF2 quirk from the dynamic OG-image work isn't
  relevant here, but the general "test against Supabase CLI's bundler
  quirks" lesson is. Edge Functions only import `.ts` files via relative
  paths; no non-TS asset bundling
- Don't import `react-dom/server` anywhere outside the prerender entry —
  the libuv-handle bug that bit us during Phase 1C still applies
- When extending `events.honoree_id` to nullable, regenerate
  `app/src/types/database.ts` and update every component that accesses
  `event.honoree.display_name` to handle the `honoree_name` fallback
- When the existing notification-preferences UI lands, gate all
  cagnotte emails on the new preferences (see PUBLIC_LAUNCH.md)
