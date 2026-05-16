# Architecture — Крысиные желания / Rat List

Living doc. Update as decisions change.

## Stack

| Layer       | Choice                                          | Notes |
| ----------- | ----------------------------------------------- | ----- |
| Frontend    | Vite + React 18 + TypeScript                    | SPA, responsive |
| Styling     | Vanilla CSS + CSS variables (design tokens)     | Editorial feel — no Tailwind |
| Routing     | TBD (`react-router` vs custom)                  | Default plan: `react-router-dom@6` |
| i18n        | TBD (`react-i18next` or custom JSON dict)       | RU default, EN later |
| Backend     | Supabase (Postgres + Auth + Storage + Edge Fn)  | Self-hostable later |
| Realtime    | Supabase Realtime (Postgres CDC)                | For live claims & santa msgs |
| Auth        | Magic link via email                            | OTP fallback enabled |
| Hosting     | TBD — own VPS vs Vercel/Fly                     | App is static; any host fine |

## Folder layout

```
/
├── app/                 # Vite + React + TS web app
├── supabase/            # config + migrations + edge functions
│   ├── config.toml      # local ports shifted to 544xx to coexist with other instances
│   └── migrations/
├── ARCHITECTURE.md      # this file
├── README.md
└── wish-list-app/       # Claude Design handoff bundle, gitignored
```

## Privacy model — read this first

This is the load-bearing constraint of the whole product.

1. **The owner of a wishlist never sees who has claimed their items.** Not
   on the item view, not in any aggregate, not in any event log, not via
   any API endpoint. Enforced in the database via RLS policies on
   `claims` (and later `item_comments`).
2. **Items are visible to a viewer only if** the viewer owns them, or the
   item is published to a group the viewer is a member of.
3. **Secret Santa assignments are visible only to the giver** until the
   event is marked "revealed". Drawing logic runs in an Edge Function
   with the service role; the client never sees the full assignment table.

Anything that violates these three rules is a P0 bug.

## Data model — v0.1

Below is the schema in the first migration. Detailed in
`supabase/migrations/20260516120000_init.sql`.

### Tables

| Table          | Purpose |
| -------------- | ------- |
| `profiles`     | Public profile per `auth.users` row (display name, handle, avatar) |
| `groups`       | A circle of friends |
| `group_members`| Many-to-many: which user is in which group, with role (admin/member) |
| `invites`      | Single-use, expiring tokens that let someone join a group |
| `items`        | A wish: title, maker, url, price range, occasion, priority, note, status |
| `item_groups`  | Many-to-many: which item is visible in which group |
| `item_photos`  | Multiple photos per item |
| `claims`       | "I'll get this one" — **hidden from item owner** |

### Helper functions (SECURITY DEFINER)

These avoid recursive RLS checks and centralise privacy logic.

| Function                       | Purpose |
| ------------------------------ | ------- |
| `is_group_member(group_id)`    | Is `auth.uid()` a member of the group? |
| `is_group_admin(group_id)`     | Is `auth.uid()` an admin of the group? |
| `shares_group_with(other)`     | Does `auth.uid()` share any group with `other`? |
| `can_see_item(item_id)`        | Can `auth.uid()` see this item (owner or via group)? |
| `owns_item(item_id)`           | Does `auth.uid()` own this item? |
| `redeem_invite(token)`         | Adds the caller to the group via token |
| `handle_new_user()` (trigger)  | Creates a `profiles` row on user signup |
| `bootstrap_group_admin()` (tg) | Adds creator as admin when a group is created |
| `set_updated_at()` (trigger)   | Bumps `updated_at` on row update |

### Key RLS policies — the privacy critical ones

**`claims` table — SELECT:**
```sql
not public.owns_item(item_id) and public.can_see_item(item_id)
```
The owner of an item literally cannot read claim rows on it. This is
checked at every read path.

**`items` table — SELECT:**
```sql
owner_id = auth.uid()
or exists (
  select 1 from item_groups ig
  join group_members gm on gm.group_id = ig.group_id
  where ig.item_id = items.id and gm.user_id = auth.uid()
)
```

**`group_members` — SELECT:** only fellow members.

## What's NOT in v0.1 (planned migrations)

| When | What |
| ---- | ---- |
| v0.2 | `item_comments` (hidden from owner), `notifications` |
| v0.3 | `santa_events`, `santa_participants`, `santa_exclusions`, `santa_assignments`, `santa_messages`, draw Edge Function |
| v0.4 | URL metadata auto-fetch Edge Function, `archive` view, audit log |

## Secret Santa — flow (v0.3 preview)

```
                          ┌─────────────┐
   organiser            ──▶│ create event│  (group_id, gift_date, budget,
   = group member         └──────┬──────┘   draw_deadline, exclusions)
                                 │
                                 ▼
   each invitee   ──── joins ──▶│ participant row, status=joined│
                                 │
                                 ▼
   draw_deadline ──── trigger ──▶│  Edge Function: draw          │
                                 │  - service role                │
                                 │  - random permutation with     │
                                 │    exclusion graph constraint  │
                                 │  - writes santa_assignments    │
                                 │  - sends notification per row  │
                                 ▼
   giver opens app          ──▶ │ sees ONLY their assignment row │
                                 │ (RLS: giver_id = auth.uid())   │
                                 ▼
   gift_date  ────── manual ────▶│ status = revealed              │
                                 │ everyone sees full assignments │
```

Edge Function for the draw is critical: clients NEVER compute or read the
full permutation. Even the organiser doesn't see other people's
assignments until reveal.

Exclusions are pairs `(user_a, user_b)` meaning "these two should not
draw each other in either direction" — typical for couples.

If draw is infeasible (over-constrained exclusion graph), the function
returns an error; the organiser must edit exclusions.

## Open questions / next decisions

- **Routing lib**: `react-router-dom@6` (heavier, conventions) vs custom
  state-based routing (lighter, fits SPA). Lean toward react-router.
- **i18n lib**: `react-i18next` vs minimal custom `t(key)`. With 1-2
  languages and a small string set, custom is fine. Lean toward custom +
  JSON dictionaries to keep deps low.
- **State management**: Plain React (useState/useReducer + Supabase
  realtime subscriptions). No Redux/Zustand until we need it.
- **Form validation**: native HTML5 + lightweight checks. No formik / RHF
  on day 1.
- **URL metadata parser** (v0.4): Edge Function with `fetch` + simple
  regex/parse for `og:image`, `og:title`, `product:price:amount`.
- **Email transport**: local dev → mailpit (Inbucket). Production → either
  Resend (cheaper, simpler) or Supabase's built-in SMTP wrapper.
- **Push notifications**: Web Push is doable as PWA. Punt to v0.5.
- **Deployment**: VPS (docker compose with caddy?) vs Vercel/Fly. VPS
  gives us self-hosted Supabase too. Decide after MVP works.

## Local dev — first run

```sh
# Start Supabase locally (custom 544xx ports — see config.toml)
supabase start

# Outputs:
#   API URL:        http://127.0.0.1:54421
#   DB URL:         postgresql://postgres:postgres@127.0.0.1:54422/postgres
#   Studio URL:     http://127.0.0.1:54423
#   Inbucket URL:   http://127.0.0.1:54424
#   anon key:       eyJ...
#   service_role:   eyJ...

# Run the web app
cd app
cp .env.example .env.local   # paste anon key + API url
npm run dev                  # http://localhost:5173
```

If another Supabase instance is running on default ports, that's fine —
ours uses 544xx so they coexist.
