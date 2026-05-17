# Events — M2 redesign (2026-05-17 evening)

Why this doc exists: the product just absorbed its largest UX shift
since v0.2. The "круги + people" navigation that shipped in Phase 1
was technically clean but conceptually backwards for the friend-group
use case. This file is the handoff explaining what changed, why, and
what's left for the next pass.

Commit: `912cdf0 feat(events): first-class Events entity, M2 redesign`
— 23 files, 3037 LOC.

---

## What the user (and his friends) said

The trigger was a Telegram conversation forwarded into the session.
Quoting (translated where helpful):

> «Если это событие то нужно кнопочку посмотреть вишлист. У меня
> есть список событий, я хотел бы посмотреть сразу твой список
> желаний к этому событию. Потом выбрать что дарю.»
>
> — friend, on what he wanted from a friend's page

> «А в people по идее я тогда не знаю что показывать. Я вижу
> машин пустой список но не понятно к какому он событию.»
>
> — same friend, on People being context-less

> «А если кликать рядом не закрывается?»
> «Закрывается, но это не всем интуитивно понятно»
>
> — Lums, on modal dismiss

> «Когда создаю новый эвент, хотелось бы сразу иметь возможность из
> my list добавить что я хочу на этот эвент. Чтобы не пришлось идти
> обратно в лист и редактировать каждое желание добавляя его в
> событие новое»
>
> — back to friend #1, on event creation friction

And from Edouard (the user) himself:

> «Сейчас есть круг — в который мы добавляем людей через ссылку
> (причем одноразовую, зачем?) и потом чтобы посмотреть список
> подарков нужно идти в people кликать на человека и смотреть его
> список подарков. Как-то не интуитивно это, наверное тогда не
> круг а евент, и вообще смысл в peaple тогда если у нас евенты»

The pain was concrete: **three clicks to see what to buy for a
specific birthday, with no "for which occasion?" context anywhere
on the way**. The mental model "круги людей с общим вишлистом"
didn't match the lived model "у меня в этом месяце два дня
рождения".

## What we considered (5 models)

Pre-decision brainstorm in the conversation, summarised:

| Model | Sketch | Verdict |
| ----- | ------ | ------- |
| **M1** | Status quo + Events on top (Circles stays primary) | Doesn't fix the click count. Skip. |
| **M2** | Events first-class, Circles drop out of primary nav | **Chosen.** |
| **M3** | Tags + subscriptions instead of circles | Overengineered for two-circle case |
| **M4** | Public-by-default profile + private items | Kills privacy default |
| **M5** | Pure event-driven (no persistent items list) | Forces re-curation every event |

The framing that settled it: **круг = долгосрочная аудитория,
event = моментная подсветка**. Both are useful as *data*; only
events are useful as *primary UI*.

## What was built — M2 in three slices

### Slice 1 — fundament (DB + hooks + skeleton)

DB (two migrations, both applied locally + types regenerated):

1. **`20260517180518_events.sql`** — three new tables:
   - `events (id, honoree_id, title, kind, occurs_on, note, …)` —
     CHECK on `kind ∈ {birthday, holidays, anniversary, wedding,
     housewarming, other}`, mirroring `items.occasion`'s closed-set
     style.
   - `event_circles (event_id, group_id)` — M:M audience.
   - `event_items (event_id, item_id, position, added_at)` — M:M
     curation. `position` for reorder (unused in MVP UI).

   Helpers (`SECURITY DEFINER`): `can_see_event`, `owns_event` —
   same shape as the existing `can_see_item` / `owns_item` pair.

   RLS:
   - events: honoree reads + audience-circle members read; only
     honoree writes.
   - event_circles: visible if event visible; honoree-only mutates,
     and only to circles they themselves belong to (`is_group_member`
     check in the INSERT policy — you can't open your event to a
     circle you don't inhabit).
   - event_items: visible if event AND item visible to the viewer;
     honoree-only mutates, and only with items they own.

   RPC `get_my_events()` — one round-trip, returns events I can see
   joined with honoree profile + item count + audience count +
   `is_honoree` boolean. Sort: upcoming first → undated → past
   (recent-first).

2. **`20260517181620_event_items_visibility.sql`** — the hole found
   during smoke-testing slice 1. Guests saw the event row but
   `item_count = 0`. Cause: items themselves were RLS-gated only
   through `item_groups → group_members`; attaching an item to an
   event open to circle X did NOT make X see the item.

   Fix: a third SELECT policy on `items` opening visibility through
   `event_items → event_circles → group_members`. Plus the same
   third path added to `can_see_item` (so any downstream check —
   like the `claims` policy — also recognises it).

   Reasoning written into the migration header: attaching an item to
   an event open to circle X is a deliberate "let X see this item"
   act. Honorees don't have to also double-publish through item_groups.

Hooks (`app/src/events/`):

- `useEvents()` — list + create/update/delete. Realtime channel on
  events / event_circles / event_items.
- `useEvent(id)` — full detail: event row, audience circles with
  group join, curated items with full item join + claims (gated by
  the existing `claims` SELECT policy, so honoree always gets []
  for own items even though some may actually be claimed). Plus
  every mutation a participant might run.

### Slice 2 — UI (Create / Detail / ItemForm integration)

- **`CreateEventScreen`** (`/events/new`) — full-screen form: title,
  kind, optional date, note, multi-select audience chips from
  `useGroups`, multi-select items grid from `useMyItems` with a
  check overlay. Submit → navigate straight to the event detail.

- **`EventDetailScreen`** (`/events/:id`) — two modes in one file:
  - **Honoree mode**: editable inline header (click "edit" → form
    for title/kind/date/note inline with save/cancel), audience
    chips have × to remove + "+ circle" expand to attach more from
    remaining groups, item cards have × to remove + "+ add items"
    panel to attach from remaining items, footer "delete event"
    with `useConfirm`.
  - **Guest mode**: read-only header, read-only audience pills,
    item cards with claim/release controls (uses the existing
    `claims` table, RLS gates everything).

- **`ItemForm` integration** — new "к каким событиям" chip section
  using `useEvents` filtered to `is_honoree`. `CreateItemInput`
  gained `event_ids?: string[]`. `useMyItems.createItem` and
  `updateItem` sync `event_items` rows using the same
  drop-and-replace dance that was already there for `item_groups`.
  `MyItem.event_ids: string[]` joins via embed on load.

### Slice 3 — nav reshuffle + People/FriendList surfaces + docs

- **Primary nav reduced to 4 tabs**: My list / Events / People /
  Santa. Circles dropped out of `Sidebar.NAV` and `BottomTabBar`.
  Code path (`/groups`) stays — the screen is reachable from
  Settings.

- **Settings panel**: new "Circles" section under Settings →
  language → danger zone. Lists my circles with member count + my
  role, links to `/groups` for management. Implementation is a small
  `CirclesPanel` component inside `SettingsScreen` using
  `useGroups`.

- **PeopleScreen**: each card shows "N events" pill if the friend
  has events open to me (computed once in parent via `useEvents`,
  passed down as prop — no per-row hook).

- **FriendListScreen** (`/p/:userId`): new "their events" section
  above the existing items list, shows each event with title + kind
  + date + open link. Filters `useEvents` to `honoree_id === userId
  && !is_honoree`.

- **i18n**: full RU + EN coverage for `events.*` (eyebrow, title,
  sub, empty states, form fields, kind labels, audience labels,
  detail edit affordances, claim controls), `settings.circles*`,
  `friend.eventsLabel`, `people.eventCount`, `add.eventsLabel /
  eventsHint`.

- **Docs**: CLAUDE.md updated (folder map, screen list, primary nav
  note, Feature status row). ARCHITECTURE.md updated (events tables
  in the data model table; items RLS now documents three SELECT
  paths).

## Smoke-test summary (psql + REST with per-user JWTs)

All scenarios passed (also re-verified in-browser after slice 2):

| Scenario | Expected | Got |
| -------- | -------- | --- |
| Мышка (honoree) reads `get_my_events()` | sees her event, `is_honoree: true` | ✅ |
| Test (audience member) reads `get_my_events()` | sees event, `is_honoree: false`, `item_count: 2` (after visibility fix migration) | ✅ |
| Hello (not in audience circle) reads `get_my_events()` | `[]` | ✅ |
| Test reads `event_items?event_id=X&select=item:items(*)` | sees both honoree items via the new visibility path | ✅ |
| Test claims `item c0caa3c0…` | claim row inserted | ✅ |
| Test reads `claims?item_id=eq.c0caa3c0…` | sees own claim | ✅ |
| Мышка (owner) reads same | `[]` — **privacy invariant intact** | ✅ |

The honoree-blind claim invariant survives the new visibility
expansion because the `claims` SELECT policy is unchanged: `not
owns_item(item_id) AND can_see_item(item_id)`. The `not owns_item`
clause is the gate, and it didn't move.

## What was deliberately NOT done

- **Santa stayed its own module.** The user was explicit: "Санта это
  отдельный модуль". No collapse of `santa_events` into `events`.
  If we ever want one, the bridge would be `events.kind = 'santa'`
  + a join from `santa_events.event_id`.
- **`items.occasion` column kept.** Existing items have it set;
  removing it would be churn for nothing. UI no longer features it
  prominently — the event-attach chips are the new primary
  "occasion" affordance.
- **No `/events/:id/edit` route.** Detail screen handles edit inline.
  One screen, two modes, simpler navigation. Reconsider if the inline
  edit form gets crowded.
- **No claims on `event_items`.** Claims stay on `items` because the
  physical gift is one — if an AirPod is in both my birthday and my
  Christmas event, claiming it should remove it from both. Keep
  claims at the item level, let event_items just be a curation
  pointer.

## Cosmetic rough edge

`PeopleScreen` row for a friend who has events but hasn't
double-published items via `item_groups` reads "0 items · 1 events"
— technically correct (`item_count` comes from `get_people` which
counts items visible via the group path) but visually weird. Two
fixes possible: update `get_people` to also count items reachable
via event audience, or just dimensionally rework the row. Tiny
issue, not a regression. Leaving for whoever does the next pass.

## Pickup tips

- **Local Supabase ports** still 544xx (see `supabase/config.toml`).
- **Generated types**: every migration regen'd via
  `supabase gen types typescript --local --schema public 2>/dev/null
  > app/src/types/database.ts`. Don't edit by hand.
- **Hook pattern**: pure free `load*` function returns a discriminated
  `FetchState`, effect calls it and `setState`s inside `.then(...)`.
  See `useEvents.ts` / `useEvent.ts` for the canonical shape. Don't
  setState synchronously inside an effect body — lint rule will catch
  it but you'll waste 5 minutes wondering why.
- **Privacy invariants** (`claims` hidden from owner; `santa_assignments`
  giver-only pre-reveal; new `event_items` audience-gated) are
  non-negotiable. Re-verify with the smoke-test script in this doc's
  "Smoke-test summary" if you touch any of these tables or their
  policies.
- **Event-audience visibility for items** means an item can become
  visible through TWO paths now. If you ever want to know "who can
  see this item", you need to OR both joins. `can_see_item` already
  does this; use the helper from RLS rather than re-implementing
  the join client-side.
- **No backwards compatibility hacks** — the user said "нет никаких
  существующих юзеров, можем не переживать". Migrations destroyed
  no data because we only added tables / policies / one new RPC.

## Untouched roadmap (from PUBLIC_LAUNCH.md)

This redesign was outside Phase 1A/1B/1C scope. The deferred items
from those phases remain:

- Rate limits (per-user sliding window) — ~1 h
- Notification preferences UI — ~1.5 h (Edouard pushed back: maybe
  unnecessary if email volume stays event-driven; revisit when there
  are users)
- Santa reveal email + account-deletion email — ~30 min
- Lighthouse re-pass against prod — ~15 min
- Supabase Pro upgrade ($25/mo) — optional

Push status at time of commit: `912cdf0` lives only locally;
classifier blocks `git push origin main` from inside the session.
Edouard's job to push.
