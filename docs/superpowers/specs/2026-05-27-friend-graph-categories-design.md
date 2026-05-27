# Friend graph + content categories

> Brainstormed 2026-05-27 with Edouard following the 2026-05-26/27 friend
> playtest rounds. **Retires `groups` entirely**; replaces the audience
> model on items with a mutual friend graph + 3-state visibility enum;
> adds Pinterest-style freeform categories as the unit of content
> organisation. Events are untouched (they already moved to a link-first
> model in #9–#18 — see `2026-05-24-events-link-first-design.md`).

## TL;DR

- **Two orthogonal axes the old model conflated.** *Audience* (who sees
  what) is handled by events (link-first, untouched) + 3-state
  `item.visibility`. *Organisation* (how I sort my own pile) is handled
  by `item.category` (freeform text, autocomplete-deduped).
- **`friendships` replaces `groups`** — symmetric edge, canonical
  ordering (`user_a < user_b`), one row per pair. No admin/member
  semantics, no kick, no leave; only friend / unfriend.
- **Friend bootstrap via A + C side-by-side** — email magic-link
  (`/friend-invite/<token>`) and per-user "add-me" share link
  (`/add-me/<token>`). Both end up calling SECURITY-DEFINER RPCs that
  insert into `friendships`. Single modal in `/people`, two paths.
- **`item.visibility = private | friends | public`**, default `friends`.
  `public` items appear on the owner's existing `/share/<share_token>`
  page (the only anonymous surface).
- **`item.category text` — single freeform string per item**, null =
  "Uncategorised". Autocomplete from the owner's existing categories,
  case-insensitive dedup. Chips at the top of MyList/FriendList/Public.
  Single category, not multi-board: extending later if needed is cheap.
- **Events untouched.** `event_participants` is independent of
  friendships. `InviteFromPeopleModal`'s internal source swaps from
  `group_members` to `get_friends()`. No structural change.
- **4-PR rollout, 3 phases:** PR 1 additive (new tables + data
  migration, both worlds coexist). PR 2 frontend switchover. PR 3
  cleanup (drop old tables). PR 4 polish.
- **`expires_at` on friend invites — no.** Stolen invite gives the
  attacker at most a soft permission (becomes your friend), and option
  A's email-binding already gates it. Token is single-use via
  `accepted_at`; sender can DELETE to revoke.

## Why this exists

The current `groups` model exists because we initially believed users
would want differential visibility ("семья видит одно, рабочие —
другое"). The 2026-05-26/27 playtest data — admittedly small
(~6 users) — shows:

- **2/3 group creators have exactly one group.** Nobody on prod has 3+.
- **The remaining slot for "audience segmentation" is already filled by
  events.** Events are how people group "X friends for a specific gift
  occasion." Generic "this group of people" buckets sit unused.
- **What users *do* want as their list grows** — per direct friend
  feedback the night this was brainstormed — is **content
  organisation**. "Where's the kitchen one?" not "Who can see this?".

That's a different axis. Pinterest separates them cleanly: boards
organise *my* content, follows handle audience. We should too.

A larger argument: `groups` is **shared infrastructure** — created by
one person, named, invited-into, kicked-from, admin-vs-member-roled.
Every one of those concepts has answers in the current code but each
one is ceremony. Friend graph is a symmetric edge — none of those
questions exist.

## Goals

1. Remove `groups`, `group_members`, `group_invites`, `item_groups`,
   `GroupsScreen`, `InviteList`, the entire concept of "circles."
2. Introduce `friendships` (mutual consent), `friend_invites` (email
   magic-link, no expiry), `add_me_token` on profile (option C).
3. Introduce 3-state `item.visibility` and freeform `item.category`.
4. Introduce category chips on MyList / FriendList / PublicList.
5. Migrate existing circles → friendships automatically. Keep archive
   tables for 7 days.
6. Preserve all current privacy invariants (claims invisibility,
   santa_assignments visibility rules).
7. Preserve editorial visual identity. New components match
   `tokens.css` (paper / ink / terracotta / hairlines / italic
   Newsreader / mono-meta).

## Non-goals (YAGNI)

- Multi-category per item — single category only. Easy to extend later.
- Category hierarchy / sub-categories — flat.
- Sharing categories ("show my Kitchen board to Anya only") —
  categories are personal organisation.
- ML / smart category suggestions — manual autocomplete from owner's
  history only.
- Friend-of-friend discovery, activity feed, "people you may know."
- Direct messaging.
- Push notifications. Email for friend-invites only; preferences
  remain out of scope (separate future feature).
- Per-friend exclusions on a single item (visibility=friends except X) —
  this is what tag-system would give, deliberately rejected for v1.
- Item-level public share link (`/i/:itemId?share=...`). The single
  per-user `/share/<share_token>` covers public access.
- Translation of user-content (categories, item titles, item notes).
- Public friend-count or visible friend-list on `/p/:userId`. Friend
  graph is private to each user.

## Design decisions

### Decision 1 — Mutual friend graph (not one-sided follow)

Wishlist is a symmetric social contract: friends give each other gifts,
look at each other's lists. One-sided follow (Pinterest/Twitter style)
invites spam and asymmetric social weirdness ("Аня меня зафолловила,
почему я её добавил?"). Mutual mirrors how the existing
`group_invites` flow works — there's continuity for users who already
trust the app's invite mechanic.

### Decision 2 — Bootstrap via A (email) + C (add-me link), not B (username)

| Path | Choice | Rationale |
|---|---|---|
| A — email magic-link | ✅ included | Mirrors existing `group_invites` infra exactly; just rename Edge Function. Email-binding gives anti-spam for free. |
| C — per-user add-me link | ✅ included | Side-channel for "I want to add a friend from Telegram/WhatsApp without knowing their email." Rotatable. |
| B — username search | ❌ rejected | Adds taxonomy infrastructure: unique handles, search index, moderation, i18n. Discoverability is a moderation-load anti-pattern at this stage. |

Both paths converge on the same `friendships` insert via
SECURITY-DEFINER RPC. UI is a single modal in `/people` with both
fields rendered side-by-side.

### Decision 3 — 3-state visibility, default `friends`

`private | friends | public`. Default `friends` is the most common
case ("I added a thing, I want my friends to see"). `public` puts the
item on the owner's `/share/<share_token>` page (the existing anon
surface), where it's accessible to anyone with the link AND to all
friends within the authed app.

Two-state (private | shared) was considered. Rejected because the case
"I want my friends to see this thing but also share my whole list with
random people via link" needs both axes.

### Decision 4 — Single freeform category, not multi-board

Pinterest allows multi-board membership. We don't, for v1:

- Single-text-field model is conceptually trivial — text, autocomplete,
  filter chips.
- Multi-board needs a junction table + UX for "add to / remove from
  board" on each item — more work.
- Extending single → multi later is straightforward (add a
  `item_categories` junction, migrate `items.category` into it).

Category is **user-content** — not translated. "Кухня" stays "Кухня"
for the owner's English friend, the same way item titles do.

### Decision 5 — Case-insensitive autocomplete dedup

If owner types "кухн..." after having created "Кухня", autocomplete
suggests "Кухня." Doesn't help across languages (intentionally), but
catches single-language casing typos. Storage = as-typed (trimmed).
Lookup = `lower()`.

### Decision 6 — No expiry on friend-invite tokens

Stolen tokens give attacker at most "becomes your friend" — a soft
permission gated by option A's email check. Tokens are single-use via
`accepted_at`. Sender can DELETE the row to revoke. Storage cost of
unaccepted-forever tokens is negligible at this scale.

### Decision 7 — Auto-confirm friendships at migration

Migration converts circles → pairwise friendships without a review
modal. At ~6 users this is two clicks of cleanup post-migration if
needed (via the `unfriend` UI). At scale this decision would be wrong;
at our scale it's correct.

### Decision 8 — `/people` route preserved; component renamed

Routing stays as `/people` (URL stability). Component renamed
`PeopleScreen` → `FriendsScreen` for code clarity. Nav-label stays
"Крысы" / "People" — the brand calls them rats and we don't change
the label.

## Data model

### Added

```sql
-- Symmetric friend edge. Canonical ordering gives exactly one row per
-- pair, prevents (a,b)+(b,a) duplicates.
create table public.friendships (
  user_a     uuid not null references public.profiles(id) on delete cascade,
  user_b     uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

-- Pending friend invite (option A — email magic-link). Single-use via
-- accepted_at. No expiry.
create table public.friend_invites (
  token       text primary key,         -- url-safe random, see "Behaviour" section for generation
  from_user   uuid not null references public.profiles(id) on delete cascade,
  to_email    text not null,            -- lowercased on insert
  message     text,                     -- optional personal note in the email
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  unique (from_user, to_email)
);

-- Per-user public "add me" link (option C). Rotatable.
alter table public.profiles
  add column add_me_token text unique;

-- 3-state visibility on items, default friends.
alter table public.items
  add column visibility text not null default 'friends'
  check (visibility in ('private', 'friends', 'public'));

-- Freeform category, null = "Uncategorised".
alter table public.items
  add column category text;

create index items_owner_category_idx
  on public.items (owner_id, category)
  where category is not null;
```

### Dropped (PR 3, after PR 2 has been live in prod ≥ 3 days)

```sql
drop table public.item_groups;
drop table public.group_invites;
drop table public.group_members;
drop table public.groups;
drop function public.is_group_member(uuid);
drop function public.generate_group_invite_token();
-- + orphan RLS policies and RPC wrappers
```

Old `send-group-invite` Edge Function is renamed in PR 2 to
`send-friend-invite` (template + payload swap). The
`magic-link.html` template remains for general auth.

### Archive (PR 1, kept 7 days post-PR 3)

```sql
create table archive_groups        as select * from groups;
create table archive_group_members as select * from group_members;
create table archive_group_invites as select * from group_invites;
create table archive_item_groups   as select * from item_groups;
```

Dropped a week after PR 3 lands, once we're confident.

## Behaviour

### Friend invite — flow A (email)

```
Inviter (Edouard):
  /people → "+ Добавить" → AddFriendModal
  ├─ email input + optional 1-line message
  └─ submit → RPC create_friend_invite(email, message)
        ├─ token := encode(gen_random_bytes(24), 'hex')  -- 48 chars, URL-safe
        ├─ INSERT friend_invites ON CONFLICT (from_user, to_email)
        │   DO UPDATE SET token = excluded.token (resend regenerates)
        └─ Edge fn send-friend-invite(token, to_email, sender_name, message)
              └─ Resend → magic-link-style email → /friend-invite/<token>

Invitee (Anya):
  click email link → /friend-invite/<token>
  ├─ if not signed in: sign in via magic link, AuthCallback returns here
  ├─ RPC accept_friend_invite(token)
  │   ├─ check: invitee.email == friend_invites.to_email
  │   ├─ check: accepted_at is null
  │   ├─ INSERT friendships (canonical order) ON CONFLICT DO NOTHING
  │   └─ UPDATE friend_invites SET accepted_at = now()
  └─ redirect /p/<from_user_id>
```

### Friend invite — flow C (add-me link)

```
Inviter:
  /people → "+ Добавить" → AddFriendModal
  ├─ shows ratlist.app/add-me/<add_me_token>
  ├─ 📋 copy / 🔄 rotate buttons
  └─ rotate → RPC rotate_add_me_token() → new token, old becomes invalid

Anyone with the link:
  open /add-me/<token>
  ├─ AddMeScreen shows: "Edouard wants to be friends" + avatar + bio
  ├─ if not signed in: sign in via magic link, return here
  ├─ RPC accept_add_me(token)
  │   ├─ lookup profile WHERE add_me_token = token
  │   ├─ check: profile != auth.uid()
  │   └─ INSERT friendships ON CONFLICT DO NOTHING
  └─ redirect /p/<profile.id>
```

### Visibility semantics

| `item.visibility` | Who can SELECT this item |
|---|---|
| `private` | Owner only |
| `friends` *(default)* | Owner + anyone in `friendships` with owner |
| `public` | Owner + friends + anyone reading `get_public_list(share_token)` for owner |

`/share/<share_token>` remains the only anonymous entry point.
`/i/:itemId` and `/p/:userId` live in the authed shell and require
friendship for `friends`-visibility items.

### Categories UX

- **Add/Edit item:** single text input "Категория" with autocomplete
  dropdown populated from `select distinct category from items where
  owner_id = me`. Matching against existing options is case-insensitive
  (`lower(category) LIKE lower($input) || '%'`); display preserves
  owner's original casing. Owner can pick existing or type new. Empty
  = null.
- **MyList:** chip row at the top: `Все · Кухня (8) · Книги (3) · …`.
  Counts come from a single pass over the items already loaded
  client-side (not a separate RPC). Active chip has terracotta
  underline. Composes with existing `sortMode` and `viewMode` (PR
  #33/#36).
- **FriendList (`/p/:userId`):** same chips, sourced from the friend's
  visible-to-me items' categories. Filters their list.
- **PublicList (`/share/<token>`):** same chips, sourced from owner's
  public items' categories.

Chip-row layout: horizontal scroll on mobile, wrap on desktop. Editorial
treatment: no buttons / no bg fill, just text + active-underline.

### Remove friend (unfriend)

- **RPC:** `unfriend(other_user_id uuid)` — symmetric. Anyone in the
  edge can call it. ON CONFLICT DO NOTHING if already removed.
- **UI surface 1:** on `/p/:userId`, kebab menu in header → "Убрать из
  крыс". `ConfirmDialog`: «Аня больше не увидит твой список, и ты —
  её. Точно?»
- **UI surface 2:** in `FriendsScreen` cards, same kebab.
- **Effect:** mutual loss of visibility on `friends`-tier items.
  `private` items unaffected (still owner-only). `public` items
  unaffected (still on `/share/...`). Events: unaffected (event
  participation is independent of friendship).

### Events — what stays, what changes

- `events`, `event_participants`, `event_items` — unchanged.
- `share_token` mechanic on events — unchanged.
- `InviteFromPeopleModal` — internal source swaps from `group_members`
  (via the deprecated cross-paths heuristic) to `get_friends()`. The
  external behaviour is identical: a list of pre-suggested people to
  invite as event participants.
- Event participants are NOT auto-added as friends. Reverse: friends
  are NOT auto-added to events. The two layers stay independent.

## RPC surface

### New

| RPC | Auth | Returns | Notes |
|---|---|---|---|
| `create_friend_invite(email, message?)` | authed | `text` (token) | upserts on `(from_user, to_email)`; calls Edge fn |
| `accept_friend_invite(token)` | authed | `uuid` (new friend's id) | email-binding check |
| `accept_add_me(token)` | authed | `uuid` (new friend's id) | no email binding |
| `rotate_add_me_token()` | authed | `text` (new token) | self-only |
| `unfriend(other uuid)` | authed | `void` | symmetric DELETE |
| `get_friends()` | authed | `setof profile_row` | for FriendsScreen |
| `get_friend_list(friend_id, category?)` | authed | `setof item_row` | items where owner=friend AND visibility ≥ friends |

### Updated

| RPC | Change |
|---|---|
| `get_public_list(share_token, category?)` | filter by `visibility='public'`; optional category filter |
| `get_event_view(...)` | no structural change, but uses `event_participants` (already does) |

### Removed (PR 3)

- `is_group_member`, `generate_group_invite_token`, any group-aware
  helpers in existing RPCs that filter by membership.

## Migration strategy

### Phase 1 — PR 1: Additive

Adds new tables and columns. Populates them from existing data. Old
schema stays live. Frontend doesn't know about new schema.

```sql
-- friendships: cartesian product of co-members within each group
insert into friendships (user_a, user_b, created_at)
select
  least(gm1.user_id, gm2.user_id),
  greatest(gm1.user_id, gm2.user_id),
  min(least(gm1.joined_at, gm2.joined_at))
from group_members gm1
join group_members gm2
  on gm1.group_id = gm2.group_id
  and gm1.user_id < gm2.user_id
group by 1, 2
on conflict do nothing;

-- items.visibility: friends if published anywhere, else private
update items
set visibility = case
  when exists (select 1 from item_groups ig where ig.item_id = items.id)
    then 'friends'
  else 'private'
end;

-- add_me_token: one per profile (hex is URL-safe by default)
update profiles
set add_me_token = encode(gen_random_bytes(16), 'hex')
where add_me_token is null;
```

**Smoke after deploy (manual SQL on prod):**

```sql
select count(*) from friendships;
select visibility, count(*) from items group by 1;
select count(*) filter (where add_me_token is null) from profiles;
```

Expected: friendships ≈ 12–15; visibility distribution non-zero on
both `friends` and `private`; zero null tokens.

### Phase 2 — PR 2: Frontend switchover

- New screens: `FriendsScreen` (renamed `PeopleScreen`), `AddMeScreen`,
  `AcceptFriendInviteScreen`.
- New components: `AddFriendModal`, `CategoryChips`, `CategoryInput`,
  `VisibilitySelector`.
- Modified: `MyListScreen`, `FriendListScreen`, `PublicListScreen`,
  `AddItemScreen`, `EditItemScreen`, `InviteFromPeopleModal`,
  `LandingScreen`, `SettingsScreen`, `Router`, `AuthCallbackScreen`.
- Old `GroupsScreen` route → 301 to `/people`.
- Send-group-invite Edge Function renamed → `send-friend-invite`,
  template swapped.
- Restrictive RLS on old `groups` / `group_members` / `group_invites` /
  `item_groups` (owner only or no SELECT) — to catch any frontend
  code that still reads them.

**Smoke in incognito on prod:**

1. Sign up new account → expect `/people` empty state.
2. Add friend by email → check Resend → click → accept → friendship
   visible both sides.
3. Open `/add-me/<token>` separately → accept → friendship visible.
4. Add item with `category='Книги'` → MyList chip shows "Книги (1)" →
   filter works.
5. Visit `/p/<friend>` → see their `friends`-visibility items, not
   their `private` items.
6. Old `/groups` URL → 301 / redirect to `/people`.

### Phase 3 — PR 3: Cleanup

≥ 3 days after PR 2 is live without rollback signal:

```sql
drop table item_groups;
drop table group_invites;
drop table group_members;
drop table groups;
drop function is_group_member(uuid);
-- + orphan RLS policies, orphan RPCs
```

Plus delete the now-orphan TS files: `GroupsScreen`, `useGroups`,
`InviteList`, old `usePeople`. Drop `landing.feature1*` keys that
mentioned circles; replace one of the 4 features with «доски» (boards).

### Phase 4 — PR 4: Polish

Whatever shakes out from PR 2's first 7 days: empty states, chip-row
overflow, category autocomplete edge cases (emoji, very long strings),
mobile chip scroll. Drop `archive_*` tables.

### Rollback

- **PR 1 fails** — `supabase migration down --local` undoes adds; no
  data was touched destructively.
- **PR 2 fails** — frontend revert; new and old schemas still both
  populated, no data loss.
- **PR 3 fails** — restore from `archive_*`. (Worst case; that's why
  archives exist.)

## UI surfaces — inventory

### Added

```
app/src/friends/
  ├─ useFriends.tsx          # wraps get_friends() + realtime
  └─ useFriendInvites.tsx    # pending sent invites (for resend / revoke)
app/src/screens/
  ├─ AddMeScreen.tsx              # route /add-me/:token (anon-friendly)
  └─ AcceptFriendInviteScreen.tsx # route /friend-invite/:token
app/src/components/
  ├─ AddFriendModal.tsx      # email + add-me-link, two paths
  ├─ CategoryChips.tsx       # chip-row filter
  ├─ CategoryInput.tsx       # text + autocomplete dropdown
  └─ VisibilitySelector.tsx  # 3-segment toggle (lock / two-rats / globe)
supabase/migrations/
  ├─ NNNN_friend_graph_add.sql      # additive  (PR 1)
  ├─ NNNN_data_migration.sql        # backfill  (PR 1)
  └─ NNNN_drop_groups.sql           # cleanup   (PR 3)
supabase/functions/send-friend-invite/
supabase/templates/friend-invite.html
```

### Renamed (code-only; routes preserved)

```
app/src/screens/PeopleScreen.tsx → FriendsScreen.tsx
app/src/people/usePeople.tsx     → app/src/friends/useFriends.tsx
```

### Modified

- `app/src/screens/MyListScreen.tsx` — `<CategoryChips>` row.
- `app/src/screens/FriendListScreen.tsx` — `<CategoryChips>` + unfriend
  kebab in header.
- `app/src/screens/PublicListScreen.tsx` — `<CategoryChips>`.
- `app/src/screens/AddItemScreen.tsx` / `EditItemScreen.tsx` —
  `<VisibilitySelector>` + `<CategoryInput>`.
- `app/src/screens/events/*` — `<InviteFromPeopleModal>` source swap.
- `app/src/Router.tsx` — new routes; `/groups` → redirect.
- `app/src/screens/LandingScreen.tsx` — update feature copy; replace
  one feature card with «доски».
- `app/src/screens/SettingsScreen.tsx` — drop "Manage groups" link.
- `app/src/auth/AuthCallbackScreen.tsx` — handle pending
  friend-invite-redirect post-signin.

### Removed (PR 3)

```
app/src/screens/GroupsScreen.tsx
app/src/screens/CircleSettingsScreen.tsx (if exists)
app/src/groups/useGroups.tsx
app/src/components/InviteList.tsx (was group-invites)
supabase/functions/send-group-invite/   # renamed to send-friend-invite
i18n keys: groups.*, landing.feature1Body old form
```

### Routing diff

```
was                              becomes
/                                /
/people    → PeopleScreen        /people     → FriendsScreen
/groups    → GroupsScreen        /groups     → redirect /people
/p/:id     → FriendListScreen    /p/:id      → FriendListScreen
                                 /add-me/:token         → AddMeScreen (new)
                                 /friend-invite/:token  → AcceptFriendInviteScreen (new)
/i/:id, /events, /santa,
/share/:token, /legal/*,
/settings, /onboarding           — unchanged
```

### Landing copy change

Current four features: `крысиные стаи` / `тайный санта` / `поделись
ссылкой` / `бумажный вайб`. The 1st one's body talks about
group-segmentation ("семья видит одно, рабочие — другое"); that
promise is being dropped.

New four features:

1. **крысиные стаи** *(body changed)* — «добавляешь крыс в стаю, они
   видят твой список, ты — их. без алгоритмов и рекламы.»
2. **тайный санта** *(unchanged)*
3. **доски** *(new, replaces "поделись ссылкой")* — «кухня, книги, для
   дома — рассортируй желания на доски, как в Pinterest. шеришь
   ссылкой — все или ничего, как сам решишь.»
4. **бумажный вайб** *(unchanged)*

The "поделись ссылкой" promise lives on inside «доски» body (the
"шеришь ссылкой" sentence). Drops are intentional: the visibility
selector on each item makes the public-link mechanic obvious in the
product itself, no need for it to be a top-level feature on the
landing.

## Privacy invariants

The CLAUDE.md privacy invariants stay intact:

1. **`claims` are invisible to the item owner** — unchanged. RLS rule
   filters `claims` for item-owner SELECTs.
2. **`santa_assignments` visibility** — unchanged. SECURITY DEFINER
   draw, giver-only visibility until `revealed`.
3. **`items` visibility** rewritten — was "owner OR member of any
   group in `item_groups`," becomes:
   - `owner_id = auth.uid()`, OR
   - `visibility = 'public'`, OR
   - `visibility = 'friends' AND friends_with(owner_id, auth.uid())`.

   The `/share/<share_token>` RPC `get_public_list` filters to
   `visibility = 'public'` regardless of auth. Authed routes apply the
   full policy above.

After PR 1 lands, re-verify all three with the existing curl/psql
pattern (CLAUDE.md "How to verify privacy invariants" section).

## Testing strategy

### Migration tests (integration suite)

Reset local DB to schema before PR 1 + fixture (3 groups, 12
memberships, 5 items in groups, 2 items not in any group). Apply
PR 1 migrations. Assert:

- `friendships` count matches expected pair count (cartesian within
  each group, canonicalised).
- `items.visibility` distribution: 5 `friends`, 2 `private`.
- `add_me_token` non-null for all profiles, unique.
- `archive_*` tables populated.

### RLS tests

Same psql/REST pattern as existing `supabase/tests/integration/`.
JWTs for users A (owner), B (friend of A), C (not friend):

- A's `visibility='friends'` item: A ✓, B ✓, C ✗.
- A's `visibility='private'` item: A ✓, B ✗, C ✗.
- A's `visibility='public'` item: A ✓, B ✓, C ✓, anon ✓ (via
  `/share/<A.share_token>`).
- `accept_friend_invite` with mismatched email → reject (no row in
  `friendships`).
- `accept_friend_invite` with already-accepted token → reject.
- `unfriend(B)` from A → B's friend-tier items invisible to A; A's
  friend-tier items invisible to B; `private` and `public` unaffected.
- `friendships` SELECT — user can only see edges they're part of.

### Frontend unit tests (RTL)

- `<AddFriendModal>` — both paths render; email validation;
  copy-to-clipboard works.
- `<CategoryInput>` — autocomplete shows existing categories;
  case-insensitive dedup; empty submit = null category; long string
  truncated visually but stored as-is.
- `<VisibilitySelector>` — default `friends`; click cycles through;
  form state updated.
- `<CategoryChips>` — renders all owner's categories with counts;
  "Все" reset; click filters.
- `useFriends` — list correct; realtime invalidates on unfriend by
  other side.

### Edge function tests (Deno)

- `send-friend-invite` — Resend API called with correct payload,
  template rendered with token + sender name + optional message;
  returns dry-run shape when `RESEND_API_KEY` absent.

### Manual smoke checklist (mandatory in each PR description)

Per the testing-discipline rules in CLAUDE.md (5 lessons from the
2026-05-25 link-first prod smoke).

## Error handling

| Branch | UI message | Logging |
|---|---|---|
| `friend_invite.accepted_at not null` | «Это приглашение уже использовано. Попроси новое.» | none |
| `friend_invite.to_email ≠ auth.email()` | «Приглашение было отправлено на другой email — попроси переотправить.» | none |
| Self-invite (`from_user = auth.uid()`) | client-side prevent + server-side `RAISE EXCEPTION` | Sentry warn if reached |
| `add_me_token` not found (rotated) | «Ссылка больше не действительна.» | none |
| Already friends (idempotent accept) | «Вы уже друзья.» + CTA `/p/<them>` | none |
| Edge fn `send-friend-invite` 5xx | «Не получилось отправить — попробуй ещё раз.» Token persists; retry upserts. | Sentry error |
| Unfriend race (both sides DELETE) | second is no-op (DELETE doesn't conflict) | none |
| Visibility downgrade race | stale view; next refresh corrects | none |

All branches flow through `app/src/lib/errors.ts`. New SQLSTATE/RAISE
codes added to `errorCode()` and translations to `errors.*` in
`ru.ts` and `en.ts`.

## Realtime + performance

- `useFriends` subscribes to `friendships` via Supabase realtime;
  series of events collapsed with `lib/debounce.ts` (bucket-3 pattern,
  300 ms trailing).
- `items` realtime channel unchanged.
- Indexes: `friendships` PK covers `(least, greatest)` lookup;
  `items_owner_category_idx` covers `(owner_id, category)` filter;
  autocomplete `select distinct category` is fine without an index at
  current scale.
- At 1000 users × 50 items the model still queries cheaply. At >100k
  items per user we'd add a materialised category list; YAGNI now.

## Risks

- **Migration timing.** PR 2 frontend assumes PR 1 schema is live.
  CLAUDE.md says migrations auto-deploy via the workflow in
  `docs/DEPLOY_MIGRATIONS_SETUP.md` — coordinate by waiting for the
  workflow run before merging PR 2.
- **Archive table cleanup.** If we forget to drop archives after PR 3,
  they sit empty taking minimal space. Not a real risk, just hygiene.
- **Add-me token guessability.** 16 bytes base64 → ≥ 22 chars,
  2¹²⁸ space. Brute-force infeasible.
- **i18n drift.** New strings must land in both `ru.ts` and `en.ts`
  (and structurally in any future `fr.ts`). The `Translation` type
  enforces structural conformance — won't compile if EN is missing
  a key.
- **Editorial vibe regressions.** Every new component must use
  `tokens.css` variables. No hardcoded colors / sizes. Watch for it
  in code review.

## Out of scope (explicit)

See "Non-goals" above. The most important explicit non-goal is
per-friend exclusion — the user considered tag-system in
brainstorming and rejected it, and we shouldn't drift back into it
during implementation under the guise of "wouldn't it be nice if...".

## Open questions

None at end of brainstorming. Implementation plan (next document)
will surface implementation-level questions.

## Handoff

Next step: `writing-plans` skill produces
`docs/superpowers/plans/2026-05-27-friend-graph-categories-plan.md`
breaking the 4 PRs into actionable steps with checkpoints.
