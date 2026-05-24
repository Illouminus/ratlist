# Events Link-First Redesign

> Brainstormed 2026-05-24 with Edouard following friend-feedback the same day.
> Replaces the **circles-first** audience model on events with a **link-first**
> sharing model that mirrors how wishlists already share via `/share/<token>`.
> Circles are retired from the primary event flow; the People tab becomes an
> auto-populated friends list derived from real event interactions.

## TL;DR

- **Events get a `share_token`** like wishlists already have. Anyone with the
  link can view the event publicly (no auth required); sign-in is needed only
  to claim items or become a participant.
- **`event_participants` table** replaces `event_circles` as the audience
  model. Implicit-tracked: a row is created on first authenticated visit via
  the token (status='active'), or pre-created with status='pending' when the
  coordinator pre-invites someone from their People list.
- **Circles retire from the events flow.** `event_circles` table is dropped;
  `groups`/`group_members`/`group_invites` tables stay in DB for other
  potential uses but are no longer surfaced anywhere events-related. The
  `/groups` route is left accessible but unlinked from nav.
- **People tab becomes an implicit address book** — auto-populated from
  co-event-participants. Click a person → their public wishlist (existing
  `/p/:userId` route, unchanged).
- **Pre-invite from People** sends both an email and an in-app entry under
  pending status. Recipient clicks email → lands on `/event/<token>` → after
  sign-in flips to active.
- **Privacy invariants preserved**: claims hidden from item owner (existing
  RLS rule); honoree-blind to claim status even via the public token view
  (the `get_event_view` RPC masks claim status appropriately).
- **No data migration burden** — existing events are wiped (testing phase, no
  real users per Edouard 2026-05-24).

## Why this exists

Friend feedback (2026-05-24, via the user's actual friends):

> The event concept and "pick gifts for an event" both work well. **What
> doesn't work** is the circles-first model: "go to settings → create a
> circle → create an event → pick which circle gets to see it." Friends'
> mental model is "I make an event and send the link in Telegram. Whoever
> wants to participate, clicks. Whoever doesn't, doesn't." Like Google Docs
> sharing or Calendly invites — not like Google+ circles.

The wishlist `/share/<token>` flow already implements the link-first pattern.
Events should match it. The inconsistency (events = audience-first, wishlists
= link-first) is itself a friction point inside the same product.

## Decisions locked (brainstorming session)

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Anonymous view depth on `/event/<token>` | Full event view + items grid; claim status hidden until sign-in | Matches `/share/<token>` for wishlists. Low friction. Privacy: honoree can't bypass via incognito (claims hidden anyway). |
| 2 | Participant model | Implicit-tracked — row created on first authed visit via token | No "join" click required. Coordinator still sees full participant list (even pending pre-invitees). |
| 3 | Circles in the new model | Retire from event flow; tables stay in DB but not surfaced; People tab takes over as auto-populated friends list | Friend feedback was explicit about circles being too complex; People is the existing surface to extend; no data deletion (sunk cost preserved). |
| 4 | Pre-invite delivery | Email + in-app entry (pending row visible in /events) | Two channels increase signal. Email gets to inbox; in-app catches users who skim email. |
| 5 | Migration of existing events | Wipe (testing phase, no real users) | Clean cut, no dual-mode product to maintain. |

## Architecture overview

```
                ┌──────────────────────────────────┐
   Anonymous    │  /event/<token>                  │
   visitor    ──▶  EventLandingScreen              │
                │  • SECURITY DEFINER get_event_view│
                │  • items grid, no claim status   │
                │  • CTA: «Войти, чтобы взять»     │
                └──────────────┬───────────────────┘
                               │ sign-in
                               ▼
                ┌──────────────────────────────────┐
                │  join_event_via_token RPC        │
                │  • upserts event_participants    │
                │    (pending→active, or new active)│
                │  • returns event_id              │
                └──────────────┬───────────────────┘
                               │ redirect /events/:id
                               ▼
                ┌──────────────────────────────────┐
                │  EventDetailScreen (participant) │
                │  • full items + claim status     │
                │  • existing claim flow unchanged │
                └──────────────────────────────────┘

   Coordinator
   creates event ─┐
                  ▼
   CreateEventScreen → /events/:id (coordinator dashboard)
                              │
                              ├── Copy share link
                              ├── InviteFromPeopleModal
                              │       │ rpc: invite_to_event (pending rows)
                              │       └─ fn: send-event-invite (email)
                              └── Manage participants
```

## Section 1 — Schema

Migration file: `supabase/migrations/20260524120000_events_link_first.sql`

```sql
-- 1. WIPE existing event data (testing phase, no real users — per Edouard 2026-05-24)
delete from public.event_items;
delete from public.event_circles;
delete from public.events;

-- 2. DROP event_circles — circles retired from event flow
drop table public.event_circles;

-- 3. events: add share_token
alter table public.events
  add column share_token text not null
    default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);

create unique index events_share_token_idx on public.events(share_token);

-- 4. NEW table event_participants
create table public.event_participants (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'active'
                    check (status in ('pending','active','declined')),
  invited_by      uuid references auth.users(id),  -- null if joined via token
  invited_at      timestamptz,                      -- null if joined directly
  joined_at       timestamptz,                      -- null while pending
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (event_id, user_id)
);
create index event_participants_user_status_idx on public.event_participants(user_id, status);
create index event_participants_event_status_idx on public.event_participants(event_id, status);

create trigger event_participants_updated_at
  before update on public.event_participants
  for each row execute function public.set_updated_at();

-- 5. Realtime
alter publication supabase_realtime drop table public.event_circles;
alter publication supabase_realtime add table public.event_participants;

-- 6. Update can_see_event helper — drop event_circles path, add participant path
create or replace function public.can_see_event(_event_id uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.id = _event_id
      and (
        e.honoree_id = auth.uid()
        or exists (
          select 1 from public.event_participants ep
          where ep.event_id = e.id
            and ep.user_id = auth.uid()
            and ep.status = 'active'
        )
      )
  );
$$;

-- 7. Update can_see_item — add event-participation path; preserve legacy group path
create or replace function public.can_see_item(_item_id uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select
    exists (select 1 from items where id = _item_id and owner_id = auth.uid())
    or exists (
      select 1 from item_groups ig
      join group_members gm on gm.group_id = ig.group_id
      where ig.item_id = _item_id and gm.user_id = auth.uid()
    )
    or exists (
      select 1 from event_items ei
      join event_participants ep on ep.event_id = ei.event_id
      where ei.item_id = _item_id
        and ep.user_id = auth.uid()
        and ep.status = 'active'
    );
$$;
```

**Decisions:**

- `share_token` is 16 hex chars (matches wishlist share-token format; short, URL-safe, unguessable for practical purposes)
- `event_participants.status` is 3-state: `pending` / `active` / `declined`. Declined is future-proof; v1 UI may not surface declined invites.
- `unique (event_id, user_id)` enforces one row per (event, user). Pre-invite then self-join → UPDATE, not duplicate row.
- `event_circles` table is fully dropped — circles retire from event flow entirely. `groups`, `group_members`, `group_invites` left untouched (other features may use them; cheap to keep).
- `honoree_id` stays — it's creator, item-owner, and recipient. HR-mode (creator ≠ honoree) is NOT being revived (parked with the cagnotte arc per 2026-05-24 strategy pivot).
- `can_see_item` extended via event-participation chain. Legacy `item_groups` path preserved for items not attached to events.

## Section 2 — RLS

```sql
-- ============= events (UPDATE existing policies) =============

-- Drop old audience-circle policy, replace with participant path
drop policy if exists "events: audience members can read" on public.events;

create policy events_participants_can_read on public.events for select
  using (
    exists (
      select 1 from public.event_participants ep
      where ep.event_id = events.id
        and ep.user_id = auth.uid()
        and ep.status = 'active'
    )
  );

-- "events: honoree can read", INSERT, UPDATE, DELETE — unchanged
-- All remain honoree-only.

-- ============= event_items =============
-- Existing policy "event_items: visible if event AND item are visible" is unchanged.
-- Underlying logic now works through the updated can_see_item (event-participation path).

-- ============= event_participants (NEW) =============

alter table public.event_participants enable row level security;

-- SELECT: participants see each other (any status); coordinator sees all
create policy event_participants_select on public.event_participants for select
  using (
    user_id = auth.uid()                                    -- own row always
    or exists (
      select 1 from public.events e
      where e.id = event_id and e.honoree_id = auth.uid()
    )                                                       -- coordinator sees all
    or exists (
      select 1 from public.event_participants self
      where self.event_id = event_participants.event_id
        and self.user_id = auth.uid()
        and self.status = 'active'
    )                                                       -- co-active sees others
  );

-- INSERT: coordinator can pre-invite (pending only, invited_by must be self)
-- Self-join via token goes through SECURITY DEFINER RPC (bypasses RLS)
create policy event_participants_insert on public.event_participants for insert
  with check (
    exists (select 1 from public.events e where e.id = event_id and e.honoree_id = auth.uid())
    and status = 'pending'
    and invited_by = auth.uid()
  );

-- UPDATE: own row OR coordinator
create policy event_participants_update on public.event_participants for update
  using (
    user_id = auth.uid()
    or exists (select 1 from public.events e where e.id = event_id and e.honoree_id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    or exists (select 1 from public.events e where e.id = event_id and e.honoree_id = auth.uid())
  );

-- DELETE: coordinator only (kick)
create policy event_participants_delete on public.event_participants for delete
  using (exists (select 1 from public.events e where e.id = event_id and e.honoree_id = auth.uid()));
```

**Privacy matrix:**

| Viewer | events | event_items | event_participants | claims |
|---|---|---|---|---|
| Honoree (=creator) | ✓ (own) | ✓ (own items) | ✓ (all) | ❌ (owner-blind, existing rule) |
| Active participant | ✓ | ✓ | ✓ (all on event) | ✓ |
| Pending participant | ❌ (RLS won't pass) | ❌ | ✓ own row only | ❌ |
| Outsider (auth, no relationship) | ❌ | ❌ | ❌ | ❌ |
| Anon with valid token | ✓ via SECURITY DEFINER RPC | ✓ items without claim status | ❌ | ❌ |
| Anon without token | ❌ | ❌ | ❌ | ❌ |

**Decisions:**

- Pending participants do NOT see the event via RLS. They get email + in-app pending-invite badge; clicking flips them to active via `join_event_via_token` RPC.
- Co-participants see each other regardless of status (so the coordinator's "X invited but hasn't joined" is visible to other participants too — keeps the social signal coherent).
- `invited_by = auth.uid()` in INSERT check prevents impersonation.
- Self-join via SECURITY DEFINER RPC — RLS INSERT not opened for this path (cleaner separation of concerns).

## Section 3 — RPCs

Five functions. Sketched here in API shape; full bodies in implementation.

### 3.1 `get_event_view(_token text)` — public

```sql
returns table (
  event_id, title, kind, occurs_on, note,
  honoree_id, honoree_name, honoree_avatar_url,
  my_status,           -- 'honoree' | 'active' | 'pending' | 'guest' | 'anon'
  participant_count,
  items jsonb          -- [{id, title, cover_url, url, price_cents, currency, is_claimed?}]
                       -- is_claimed: true/false if viewer = active participant AND NOT honoree
                       -- is_claimed: null if anon / pending / honoree
)
language plpgsql security definer set search_path = public
```

- Granted to `anon, authenticated`.
- Resolves token; raises `event_not_found` if invalid.
- Determines viewer role and masks claim status accordingly.

### 3.2 `join_event_via_token(_token text)` — auth required

```sql
returns uuid              -- event_id (for redirect)
language plpgsql security definer set search_path = public
```

- Granted to `authenticated`. Raises `not_authenticated` if `auth.uid()` is null.
- Resolves token → `event_id, honoree_id`; raises `event_not_found` if invalid.
- If caller IS honoree → no row created, returns event_id.
- Else: upsert into `event_participants` with `on conflict do update set status='active', joined_at=coalesce(...)`.
- Idempotent.

### 3.3 `invite_to_event(_event_id uuid, _user_ids uuid[])` — auth required

```sql
returns integer           -- count of new rows actually inserted
language plpgsql security invoker set search_path = public
```

- Granted to `authenticated`. RLS INSERT policy enforces honoree-only.
- Bulk INSERT with `on conflict (event_id, user_id) do nothing` (re-invite is no-op).
- Returns count for UI toast.

### 3.4 `get_my_people()` — auth required

```sql
returns table (
  user_id, display_name, handle, avatar_url,
  has_public_list,           -- bool: profiles.public_share_token IS NOT NULL
  last_interaction_at
)
language sql security invoker stable set search_path = public
```

- Granted to `authenticated`.
- Returns co-active-participants from events where caller is honoree OR active participant.
- Excludes self. Excludes profiles with `disabled_at` or `deleted_at` set.
- Order by `last_interaction_at desc`.

### 3.5 `get_my_events()` — auth required, UPDATED

Existing function; rewritten. Changes:

- DROP returned column `audience_circle_count` (circles retired).
- ADD returned column `participant_count` — count of `event_participants` rows with `status='active'` only (pending invitees not counted in the public-facing number; coordinator can see pending breakdown via the EventDetailScreen participant list).
- ADD returned column `share_token`.
- ADD returned column `my_status` ('honoree' | 'active' | 'pending').
- WHERE clause expands to include events where caller is honoree OR active participant OR pending participant.

**Grants:**

```sql
grant execute on function public.get_event_view(text)              to anon, authenticated;
grant execute on function public.join_event_via_token(text)        to authenticated;
grant execute on function public.invite_to_event(uuid, uuid[])     to authenticated;
grant execute on function public.get_my_people()                   to authenticated;
grant execute on function public.get_my_events()                   to authenticated;
```

**Decisions:**

- `get_event_view` granted to `anon` — only path to surface event data without auth in RLS chain. Self-contained auth check inside the function.
- `join_event_via_token` SECURITY DEFINER (atomic upsert with token validation; bypasses RLS INSERT which is intentionally narrow).
- `invite_to_event` SECURITY INVOKER + RLS gate — cleaner separation; RLS already says "honoree only" for pending invites.
- `get_my_people` derived from events only, NOT claims (avoiding any path that could leak claim info to honoree via People).
- No `dismiss_pending_invite` RPC — direct UPDATE works under existing own-row RLS.

## Section 4 — Edge Function `send-event-invite`

Mirror of [`send-group-invite`](supabase/functions/send-group-invite/index.ts) and
[`send-santa-start`](supabase/functions/send-santa-start/index.ts).

**Files:**
- `supabase/functions/send-event-invite/index.ts`
- `supabase/functions/send-event-invite/template.ts`
- `supabase/functions/send-event-invite/index.test.ts` (Deno)

**API:**

```
POST /functions/v1/send-event-invite
Authorization: Bearer <user JWT>
Body: { event_id: uuid, user_ids: uuid[] }
→ { sent: number, skipped: number }
```

**Logic:**

1. Auth check: caller JWT must be honoree of `event_id`; otherwise 403.
2. Service-role fetch: event details + inviter display_name + recipient profiles (email + display_name).
3. For each recipient:
   - Check `event_email_log` (idempotency table — extend existing `santa_email_log` pattern) for `(event_id, recipient_id, 'invite')`; skip if already sent.
   - Render HTML + text via `template.ts`.
   - Send via existing `_shared/email.ts` (Resend wrapper).
   - Log success/failure to `event_email_log`.
4. Return counts.

**Idempotency log:**

Create new table `event_email_log` mirroring the shape of the existing `santa_email_log` (see [`20260517193925_santa_email_idempotency.sql`](../../../supabase/migrations/20260517193925_santa_email_idempotency.sql)). One row per `(event_id, recipient_id, email_type)`; UNIQUE constraint prevents double-send. Migration for this table belongs in PR B (alongside the Edge Function), not PR A.

**Email content (RU only for v1, EN later):**

- **Subject**: `{Саша} приглашает тебя на «{День рождения Оли}»`
- **Body**: short greeting, single sentence with inviter name + event title + occurs_on (if set), prominent CTA button → `https://ratlist.app/event/{share_token}`, footer with unsubscribe-placeholder
- **Aesthetic**: paper background, Newsreader serif headline, accent CTA — match existing `send-group-invite` template

**Deployment:**

```sh
supabase functions deploy send-event-invite --project-ref fiuheufmawxkgbqddwwu
```

`RESEND_API_KEY` already set on the project (per PUBLIC_LAUNCH 1C cleanup state).

**Out of scope for v1:**

- Email preferences gating (`email_prefs` JSONB on profiles) — deferred to PUBLIC_LAUNCH backlog
- EN translation — deferred to landing/copy re-brand
- Reminder emails (X days before event) — YAGNI

## Section 5 — UI surfaces

Six screen-level changes. Most are extensions of existing screens; no new layout language.

### 5.A — CreateEventScreen (modify)

[`app/src/screens/events/CreateEventScreen.tsx`](app/src/screens/events/CreateEventScreen.tsx)

**Remove:** audience picker (circles selection). All UI bits.

**Keep:** title, kind, occurs_on, note, item picker (`event_items` curation).

**Add — post-create share screen:**

After submit, redirect to intermediate "share screen" instead of directly to `/events/:id`:
- Big paper card: «Готово!»
- Display: `https://ratlist.app/event/<token>` + copy button
- Optional CTA: «Сразу пригласить кого-то из своих» → opens InviteFromPeopleModal
- Final button «Дальше» → `/events/:id` (full coordinator dashboard)

### 5.B — EventLandingScreen (NEW)

New file: `app/src/screens/events/EventLandingScreen.tsx`. Route: `/event/:token`.

Mirrors structure of existing [`PublicListScreen`](app/src/screens/PublicListScreen.tsx).

**Anon view** (no session):
- `PaperLayout` without chrome
- Header: event title + occurs_on + honoree avatar + display_name
- Soft counter: «X друзей участвуют»
- Items grid (cover + title + price), no claim status, no claim buttons
- Floating CTA: «Войти, чтобы взять подарок» → `/login?next=/event/<token>`

**Authed view (active or new visitor):**
- Same layout
- On mount, auto-call `join_event_via_token(token)` → upsert active
- Redirect to `/events/:id` (existing `EventDetailScreen` for participant)

**Authed honoree:**
- On mount, detect → redirect to `/events/:id` (own coordinator view)

**Authed pending (clicked email link):**
- Same flow as anon-after-sign-in: `join_event_via_token` flips pending→active → redirect to `/events/:id`

### 5.C — EventDetailScreen (modify, coordinator only)

[`app/src/screens/events/EventDetailScreen.tsx`](app/src/screens/events/EventDetailScreen.tsx)

For honoree (coordinator view), add:
- **Share card** in header: link + copy button + open button (mailto / TG share)
- **«Позвать друзей»** button → opens `InviteFromPeopleModal`
- **«Участники»** section (collapsed by default):
  - List participants (avatar + display_name + status badge)
  - Per-row action: «убрать» (DELETE) or «напомнить email'ом» (resend invite)
- Existing item curation UI unchanged

For participant: no changes. Existing claim flow + RLS handles everything.

### 5.D — InviteFromPeopleModal (NEW)

New component: `app/src/screens/events/InviteFromPeopleModal.tsx`.

```
┌─ Кого позвать на «{title}»? ─────────┐
│                                       │
│ [ ] Таня      • last seen 3 дня      │
│ [ ] Миша      • last seen 1 неделя   │
│ [x] Оля       • last seen 2 недели   │
│ [x] Саша      • last seen 1 мес      │
│                                       │
│ ───────────────────────────────────── │
│ Список — те с кем ты уже была на     │
│ events'ах. Им придёт email + appear  │
│ в /events с пометкой «приглашение».  │
│                                       │
│        [ Cancel ]  [ Позвать 2 → ]    │
└───────────────────────────────────────┘
```

- Data source: `get_my_people()` RPC
- Submit:
  1. `rpc('invite_to_event', { _event_id, _user_ids })`
  2. `functions.invoke('send-event-invite', { body: { event_id, user_ids } })` (fire-and-forget, `.catch(...)`)
- Success toast: «Позвал N друзей» via [`useToast`](app/src/components/Toast.tsx)

### 5.E — PeopleScreen (modify)

[`app/src/screens/people/PeopleScreen.tsx`](app/src/screens/people/PeopleScreen.tsx)

- Switch data source: `get_my_people()` instead of group-member-based query
- Per-row click → `/p/:userId` (existing [`FriendListScreen`](app/src/screens/people/FriendListScreen.tsx), unchanged)
- Empty-state copy: «Здесь появятся друзья после твоего первого event'а»

### 5.F — EventsScreen (modify)

[`app/src/screens/events/EventsScreen.tsx`](app/src/screens/events/EventsScreen.tsx)

- Pending events shown with badge: «приглашение от {inviter_name}»
- Per-row inline actions:
  - «Принять» → `join_event_via_token` → active → open event
  - «Отклонить» → direct UPDATE status='declined' (RLS allows own-row)
- DROP `audience_circle_count` from card (column gone from RPC)
- ADD `participant_count` badge

### Nav / Routes

- `/groups` route stays, but **not surfaced anywhere in nav**. Defer explicit deprecation; YAGNI for now.
- `/event/:token` — new public route, added to [`Router.tsx`](app/src/Router.tsx) alongside `/share/:token`. Eager-loaded (critical path for anon viewers from email links).

### What we do NOT touch

- OnboardingScreen — already minimal (handle + display name)
- FAB → `/add` — unchanged (item creation stays primary)
- Santa flow — unchanged
- ItemDetail / AddItem / EditItem — unchanged

## Section 6 — Test plan + PR layout

### Test plan — strict TDD (test commit before impl commit)

**Integration tests** (`supabase/tests/integration/`):

| File | Coverage |
|---|---|
| `events-link-rls.test.ts` | RLS matrix: honoree × active × pending × outsider × anon, on events / event_items / event_participants |
| `events-link-rpcs.test.ts` | `get_event_view` claim-masking by viewer; `join_event_via_token` upsert + idempotency; `invite_to_event` count + dup-skip; `get_my_people` co-participants only, no claim derivation |
| `events-link-privacy.test.ts` | Honoree-blind-claims invariant is NOT broken — claims still not visible to item owner via any new path |
| `events-link-migration.test.ts` | After migration: event_circles is dropped, share_token unique-indexed, event_participants empty initially |

**Frontend tests** (`app/src/**/__tests__/`):

| Subject | Test |
|---|---|
| `useEvent.test.tsx` | load + my_status detection; pending → join flow |
| `useEvents.test.tsx` | filters: honoree vs active vs pending |
| `usePeople.test.tsx` | load from get_my_people; empty state copy |
| `CreateEventScreen.test.tsx` | submit → share screen revealed; copy button works |
| `EventLandingScreen.test.tsx` | anon → sign-in CTA; authed → auto-join + redirect; honoree → direct redirect |
| `InviteFromPeopleModal.test.tsx` | select multiple → submit → RPC called + Edge Function called + toast |

**Edge Function tests** (`supabase/functions/send-event-invite/index.test.ts`, Deno):

- Auth-check rejects non-honoree
- Recipient lookup via service-role
- Idempotency log skips duplicates
- Template rendering smoke

**TDD ritm per commit:**

- 1 commit `test(area):` — red (migration/RPC/code doesn't exist yet)
- 1 commit `feat(area):` — green (minimal implementation)
- 1 commit `refactor(area):` — optional (cleanup)

Apply per-feature, not per-test. Multiple test cases for one feature can sit in one test commit, but the test commit MUST land before the impl commit.

### PR layout — 4 PRs, stacked

```
main
 └── PR A  feat(db): events link-first — schema + RLS + RPCs + tests
      └── PR B  feat(edge): send-event-invite + Deno tests
           └── PR C  feat(ui): public event landing + simplified create flow
                └── PR D  feat(ui): coordinator dashboard + People + invite modal + pending invites
```

| PR | Scope | Contents | Ship on its own? |
|---|---|---|---|
| **A** | Data layer | Schema migration, RLS, 5 RPCs, integration tests, `types/database.ts` regen, frontend fix-up (remove `audience_circle_count` references from EventsScreen card) | ✅ existing UI continues to function |
| **B** | Email | Edge Function + template + idempotency log + Deno tests + docs for deploy | ✅ no client invocation yet |
| **C** | Public flow | `/event/:token` route + EventLandingScreen + CreateEventScreen simplification + post-create share screen + RTL tests | ✅ new functions, old doesn't break |
| **D** | Coordinator + People | EventDetailScreen coordinator section + InviteFromPeopleModal + PeopleScreen data-source switch + EventsScreen pending UI + RTL tests | ✅ closes the feature |

### Migration story

PR A lands → migration runs `wipe events + drop event_circles + create event_participants` on both local and prod. Test users (3 in `auth.users`) preserved; 2 test items preserved (items are not touched). Need to re-seed test events manually if used for development.

## Out of scope (deferred to follow-up specs)

- **Notification preferences UI** (`email_prefs` JSONB) — already in PUBLIC_LAUNCH backlog
- **EN localization** of new email templates — wait until landing/copy re-brand
- **`/groups` route cleanup** — leave route accessible without nav link; explicit deprecation later
- **Re-invite reminder emails** ("X days before event") — YAGNI
- **Declarative decline UI** with confirmation — simple status='declined' UPDATE is enough
- **HR-mode events** (creator ≠ honoree, text-only honoree) — parked with cagnotte arc; not reviving
- **Per-token rotation** (regenerate share_token for an event) — can land as a 1-line RPC follow-up if needed
- **Per-event "close to new joiners"** (lock event after a certain date) — YAGNI
- **Anonymous claim** ("I'll take this without signing in") — out of scope; sign-in is the trust signal

## Pickup tips for the executor

- This spec assumes `superpowers:executing-plans` or `superpowers:subagent-driven-development` to run the implementation. Strict TDD per the test-driven-development skill is mandatory — the prior cagnotte arc skipped TDD discipline (commits had `feat:` then `test:` instead of `test:` then `feat:`) and that lesson is the explicit reason this spec emphasizes test-first.
- Branch protection on `main` is active — every PR goes through GitHub PR review (no direct push).
- Privacy invariants (CLAUDE.md → "Privacy invariants") are non-negotiable. The `events-link-privacy.test.ts` integration test is the gate — verify it passes after each PR.
- Editorial design system (paper / ink / accent / Newsreader / Caveat) applies to every new UI surface. Use existing design tokens, not hardcoded values.
- Errors must flow through `app/src/lib/errors.ts`. Add `event_not_found`, `not_authenticated` (if not already there) with both ru.ts and en.ts strings.
- Local Supabase ports are **544xx** (not default 543xx) — don't stop the other instance.
- Realtime: `event_participants` is added to `supabase_realtime` publication. Make sure useEvent / useEvents react to participant changes (someone joined).
- Memory at `~/.claude/projects/-Users-edouard-dev-wishlist/memory/` will be auto-loaded and contains the strategic context (cagnotte dropped, EN+FR audience, mascot mode brand).
