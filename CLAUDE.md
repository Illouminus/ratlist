# Крысиные желания / Rat List — agent handoff

A wishlist + Secret Santa app — started as a private tool for one
friend group, now publicly deployed on **`ratlist.app`**. Phase 1A
(production deploy, legal, email, account self-mgmt, SEO) and Phase
1B (OAuth Google, PWA + service worker, dynamic OG image, focus
traps, Plausible, uptime) shipped 2026-05-17. v0.2 is feature-complete:
groups, items, public share URLs, Secret Santa, realtime, priority
levels, an editorial landing page, account self-management,
GDPR-compatible legal pages.

> Start here. Then read [ARCHITECTURE.md](ARCHITECTURE.md) for the data
> model and [README.md](README.md) for one-paragraph context. Memory at
> `~/.claude/projects/-Users-edouard-dev-wishlist/memory/MEMORY.md` adds
> user-preference context that's auto-loaded.
>
> **Going public?** → see [PUBLIC_LAUNCH.md](PUBLIC_LAUNCH.md). It owns
> the deployment + monetization roadmap; this file only covers
> conventions and what's already shipped locally.

## Stack at a glance

| Layer       | Choice                                             |
| ----------- | -------------------------------------------------- |
| Frontend    | Vite + React 19 + TypeScript (strict)              |
| Styling     | Vanilla CSS, design tokens via CSS variables       |
| Routing     | `react-router-dom@7` (JSX API, not data router)    |
| i18n        | Custom tiny dict + context (`src/i18n/`)           |
| Backend     | Supabase (Postgres + RLS + Auth + Storage + Edge)  |
| Hosting     | Vercel (frontend) + Supabase Pro project (Frankfurt) |

## Quick start

```sh
# 1. Local Supabase (running on shifted ports 544xx to coexist with
#    another instance the user has on the default 543xx).
supabase start

# 2. App
cd app
cp .env.example .env.local    # (already filled in this repo)
npm install                   # first time
npm run dev                   # http://localhost:5173

# 3. Edge function (URL meta fetcher) — separate process
supabase functions serve --no-verify-jwt
```

Useful URLs:
- App: http://localhost:5173
- Supabase Studio: http://localhost:54423
- Mailpit (catches auth emails): http://localhost:54424
- DB direct: `postgresql://postgres:postgres@127.0.0.1:54422/postgres`

## Hard conventions (do not break)

### TypeScript

`tsconfig.app.json` has `strict: true`, `noUncheckedIndexedAccess: true`,
`noImplicitReturns`, etc. **Never widen with `any`.** Use `unknown` for
truly-unknown values and narrow.

### React + hooks

`react-hooks/set-state-in-effect` is enforced. Pattern across every
hook (`useMyItems`, `useGroups`, `useSantaEvent`, …):

- A pure free async fetcher returns the next `FetchState`
- `useEffect` calls it and `setState` happens inside `.then(...)` — so
  state updates always sit after a yield, never synchronously inside
  the effect body

Don't break this pattern when adding new hooks. If lint complains about
setState-in-effect, you wrote it wrong.

### Errors

Every Supabase error (PostgrestError / AuthError / FunctionsError /
string) flows through `app/src/lib/errors.ts`. Add new failure modes by
matching SQLSTATE or RAISE EXCEPTION text in `errorCode()` and adding a
string under `errors.*` in both `ru.ts` and `en.ts`. UI uses
`setError(errorMessage(t, result.error))` — never `setError(result.error)`.

### i18n

`src/i18n/ru.ts` is the source of truth. `src/i18n/en.ts` must conform
to the same `Translation` shape (recursive — nesting allowed, e.g.
`errors.titleTooLong`). Newlines in strings render as line breaks when
the element has `whiteSpace: 'pre-line'`.

Keys are dot-paths: `t('list.headlineMine', { count: 3 })`. The `t()`
function falls back to RU then to the raw key with a dev-mode warning.

### CSS / design

Tokens in `src/styles/tokens.css`. Use CSS variables, **not** hardcoded
sizes. The responsive ones to know:

- `--page-pad-y`, `--page-pad-x` — clamp-based page padding
- `--display-xl/l/m/s/xs` — clamp-based heading sizes (28→48, 24→40,
  etc.)
- `--bp-tablet: 768px` — single breakpoint. CSS media queries match.

Editorial vibe: paper background, ink text, terracotta accent, hairlines
instead of cards, Newsreader italic for display, Public Sans for body,
Caveat for marginalia. Stick to it.

### Privacy invariants (DO NOT regress)

These are enforced at the DB via RLS — not the client. Tested via
psql/REST during development. **If you touch the schema or any of these
tables, re-verify after.**

1. `claims` rows are **invisible to the owner** of the item.
   Item-owners viewing their own list never see who claimed what.
2. `santa_assignments` rows are visible only to the giver until the
   event status flips to `revealed`. Even the organiser is blind unless
   they themselves joined as a participant.
3. `items` are visible to the owner OR to members of any group the
   item is published to (`item_groups` junction).

The draw runs in a `SECURITY DEFINER` Postgres function
(`run_santa_draw`); clients never INSERT into `santa_assignments`.

## File map

```
/
├── ARCHITECTURE.md          schema, RLS, Santa flow
├── README.md                one-paragraph project intro
├── CLAUDE.md                this file
├── supabase/
│   ├── config.toml          local ports shifted to 544xx
│   ├── migrations/          all SQL — apply via `supabase migration up --local`
│   └── functions/
│       └── fetch-url-meta/  Deno Edge Function (URL → og:/JSON-LD/Amazon meta)
└── app/
    ├── .env.local           supabase URL + anon key (gitignored)
    ├── tsconfig.app.json    strict TS settings
    ├── vite.config.ts       dedupes react across deps
    └── src/
        ├── main.tsx         client entry — hydrateRoot (createRoot in dev)
        ├── prerender.tsx    Node entry called by vite-prerender-plugin
        ├── App.tsx          provider tree; takes a router as `children`
        ├── Router.tsx       AppRoutes (no Router) — both entries wrap it
        ├── auth/            AuthProvider, useAuth, useProfile, RequireAuth
        ├── items/           useMyItems, fetchUrlMeta, uploadItemImage
        ├── groups/          useGroups, useGroupInvites
        ├── people/          usePeople, useFriendList
        ├── santa/           useSantaEvents, useSantaEvent
        ├── components/      shared atoms (see below)
        ├── screens/         one folder per area + top-level auth screens
        ├── i18n/            recursive dict, useI18n, plural helper
        ├── lib/             supabase client, db row types, errors mapper
        ├── styles/          tokens, fonts, global
        └── types/database.ts auto-generated; never edit by hand
```

### Components inventory

Visual atoms (`app/src/components/`):
- `PaperLayout` — page padding + max-width column. Used by every screen.
- `AppLayout` — chrome (sidebar on desktop, mobile top + bottom tab bar
  on mobile). Wraps authed routes via `Router.appRoute()`.
- `Sidebar` / `BottomTabBar` / `MobileTopBar` — the chrome pieces
- `Button` — primary / dark / ghost variants
- `Field` — label + input wrapper
- `SketchInput` — text input with underline only
- `LangToggle` — RU/EN switcher
- `ItemPhoto` — `<img>` if cover_url, else `PhotoPlaceholder`
- `PhotoPlaceholder` — watercolour fallback
- `OccasionTag` — dot + uppercase label
- `PriorityDots` — •/••/••• priority marker
- `EndOfList` — "that's the lot — for now." marker with tail doodle
- `Toast` + `useToast()` — transient bottom-of-viewport notice
- `ConfirmDialog` + `useConfirm()` — promise-based modal confirm
  (replaces window.confirm everywhere)
- `ShareDialog` — controls the public share token (`/share/<token>`)
- `rats/` — five SVG illustrations (Sitting, Running, Peeking, Tail,
  RatDefs filter)

### Screens

Public (no auth):
- `/` for anonymous → `LandingScreen` (editorial marketing page)
- `/login`, `/auth/callback`, `/invite/:token` — auth flow
- `/share/:token` → `PublicListScreen` (view-only, anon allowed)
- `/onboarding` — authed but pre-onboarding

Authed (full chrome via `appRoute`):
- `/` for authed → `MyListScreen` (items grid/list)
- `/add` → `AddItemScreen` (full-screen create form)
- `/i/:itemId` → `ItemDetailScreen` (works for own + friend's items)
- `/i/:itemId/edit` → `EditItemScreen` (full-screen edit form)
- `/groups` → `GroupsScreen` (circles + members + invites)
- `/people` → `PeopleScreen` (directory with preview titles)
- `/p/:userId` → `FriendListScreen` (their list + claim/release)
- `/santa` → `SantaListScreen` (events)
- `/santa/:eventId` → `SantaEventScreen` (participants, exclusions,
  draw, reveal)

All authed routes are lazy-loaded via `React.lazy` — see
`Router.lazyNamed()`. Landing + auth screens are eager (critical path).

## Feature status

| Feature                                                  | Status |
| -------------------------------------------------------- | ------ |
| Magic-link auth + onboarding                             | ✅      |
| Multiple groups + invite tokens                          | ✅      |
| Group management (rename / delete / promote / kick / leave) | ✅   |
| One-tap "invite from existing rats"                      | ✅      |
| Items CRUD (create, edit, delete)                        | ✅      |
| Item detail page (`/i/:itemId`) — own + friend's         | ✅      |
| Full-screen add/edit forms (`/add`, `/i/:itemId/edit`)   | ✅      |
| Per-group publishing + "приват" badge                    | ✅      |
| Cover photo upload (Supabase Storage)                    | ✅      |
| URL metadata auto-fetch (og: + JSON-LD + Amazon-specific)| ✅      |
| Priority chips + •/••/••• marker                         | ✅      |
| People directory with preview titles + "updated X"       | ✅      |
| Friend's list with claim/release (RLS-hidden from owner) | ✅      |
| Secret Santa: create / join / draw / reveal              | ✅      |
| Santa exclusions UI                                      | ✅      |
| Public view-only share URLs (`/share/<token>`)           | ✅      |
| Realtime updates (Supabase channels — items / groups / claims) | ✅ |
| Editorial landing page (`/` for anonymous)               | ✅      |
| Toast + ConfirmDialog primitives                         | ✅      |
| Hand-drawn rats sprinkled in margins                     | ✅      |
| i18n RU + EN                                             | ✅      |
| Centralised error mapping                                | ✅      |
| Responsive sidebar/bottom-tab layout                     | ✅      |
| Code-split routes via React.lazy                         | ✅      |
| **Deploy on `ratlist.app`** (Vercel + prod Supabase)     | ✅ Phase 1A done (2026-05-17) |
| **Email transactional** (Resend + branded magic-link)    | ✅ Phase 1A done |
| **Legal: Privacy / Terms / 13+ gate**                    | ✅ Phase 1A done — `/legal/*` routes |
| **Account self-management** (`/settings`, delete, export)| ✅ Phase 1A done |
| **SEO statics** (OG meta, robots, sitemap, favicon)      | ✅ Phase 1A done |
| **Sentry frontend SDK** (gated on env DSN)               | ✅ Phase 1A done |
| **OAuth Google** (button on /login)                      | ✅ Phase 1B done — see [docs/OAUTH_GOOGLE.md](docs/OAUTH_GOOGLE.md) |
| **PWA** (manifest + service worker + full favicon set)   | ✅ Phase 1B done |
| **Dynamic OG image** (Edge Function, satori + WOFF)      | ✅ Phase 1B done — `/og.png` rewrite |
| **Focus traps + WCAG AA + landmarks + loading skeletons**| ✅ Phase 1B done |
| **Plausible + uptime monitoring** (code wired, docs ready) | ✅ Phase 1B done — gated on env DSN |
| **Pre-render landing + legal** (vite-prerender-plugin)   | ✅ Phase 1B done — `dist/index.html`, `dist/legal/{privacy,terms}/index.html`; `_spa.html` is the SPA fallback for unknown routes |
| **Per-share-token OG image variant**                     | ⬜ deferred — ~1 h follow-up |
| **Supabase Pro upgrade**                                 | ⬜ optional — $25/mo, unlocks image transforms + backups |
| Share % (partial claims)                                 | ⬜ (schema has `share`, no UI) |
| Anonymous Santa chat                                     | ⬜      |

## Known gotchas

### Local Supabase ports

We run on **544xx** (54421 API / 54422 DB / 54423 Studio / 54424 Mailpit
/ 54427 Analytics / 54420 shadow). This is to coexist with the user's
other Supabase project that runs on default 543xx. **Don't `supabase
stop` the other instance** without authorisation — the user said
"наверное" which the classifier read as tentative.

### `verbatimModuleSyntax`

`tsconfig` has `verbatimModuleSyntax: true`. Type imports must use
`import type { ... }`. If you forget, tsc complains.

### React 19 + react-router 7 dedupe

`vite.config.ts` dedupes `react` and `react-dom` across deps. Without
this, react-router 7 pulled its own copy of React via Vite's
pre-bundler and broke hooks. **Don't remove the `dedupe` config.**

### Amazon prices

`fetch-url-meta` extracts title + photo from Amazon via productTitle
span and `data-old-hires`. Prices are rendered client-side by Amazon
JS, so static fetch can't see them — documented in the function header.
A headless browser would solve this but isn't worth it for v0.1.

### Item title length

Items have a CHECK constraint `length(title) between 1 and 200`.
Long og:title from a fetched URL is truncated to 100 chars before
prefilling the form. See `MyListScreen` → `AUTOFILL_TITLE_LENGTH`.

### When you change a migration

- New: `supabase/migrations/<UTC timestamp>_*.sql`. Apply with
  `supabase migration up --local`. Then **regenerate types**:
  `supabase gen types typescript --local --schema public 2>/dev/null
  > app/src/types/database.ts`
- Existing applied migration: don't edit. Add a new one.

### Test users in the local DB

Three users exist in `auth.users` for psql/REST testing:
- `462ecd08-...` — krysa@example.com (display: "Мышка")
- `d94dc0e9-...` — test@example.com
- `aaaa1111-...` — third@example.com
Plus a "Тестовый круг" group with all three in it, and 2 items owned
by krysa.

## How to verify privacy invariants

The user cares about them. After any change to `claims`, `items`,
`santa_*`, or their RLS, re-run something like:

```sh
# Mint a JWT for a user (replace sub)
JWT=$(node -e "...")
# Owner viewing own items — claims must be []
curl -s "http://127.0.0.1:54421/rest/v1/items?owner_id=eq.<owner-id>&select=id,claims(user_id)" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT_OWNER"
# Non-owner viewing the same — claims must include the claim
curl ... -H "Authorization: Bearer $JWT_OTHER"
```

The first session's commit messages have full examples — search
`git log -p` for `psql` and `curl`.

## What the user values

(captured from feedback)
- Clean code, comments, modular, strict types — not hacky
- Russian UI, casual register
- Responsive matters; mobile is primary
- Don't leak DB errors to the UI (we now have the central mapper —
  use it)
- Don't break the editorial aesthetic — paper, ink, terracotta,
  hairlines, italic Newsreader, Caveat marginalia, rat doodles in
  margins
- The user explicitly de-prioritised deploy multiple times — "успеем
  задеплоить когда все сделаем локально". Don't lead with deploy in
  recommendations; finish the product first
- Latest direction (2026-05): product is being positioned for public
  launch with eventual affiliate monetization. The deployment +
  marketing work lives in [PUBLIC_LAUNCH.md](PUBLIC_LAUNCH.md), to be
  picked up in a future dedicated session

## Commit conventions

Conventional commits style: `feat(area):`, `fix(area):`, `refactor(area):`,
`chore:`. The user wants atomic commits per logical change. **Always**
end commit messages with:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Use the heredoc form for git commit -m to preserve formatting.

## Skills you'll want

If you're Claude Code: read the auto-loaded memory at the top of
`MEMORY.md`, then this file, then `ARCHITECTURE.md`. Don't re-derive
context already captured there.

When in doubt about a design choice, look at the original Claude
Design handoff bundles (gitignored at `wish-list-app/` if still
present locally). They were what we built from.
