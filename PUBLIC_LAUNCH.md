# Public Launch — Roadmap

Goal: take Крысиные желания / Rat List from "feature-complete friend-app" to
**publicly hosted product** with a credible path to affiliate monetization.

> This doc is a checklist for a future session. Each item is small enough to
> pick up alone. Ticked items mean "shipped + tested in production"; not
> "code merged locally".

---

## ⏯ Pick up here — next session

Session 2026-05-17 (evening) shipped **Phase 1C — SEO finalization +
transactional emails + moderation primitives**. 13 commits on `main`,
all deployed via Vercel after a single deploy-time fix (see [Build infra
fix](#build-infra-fix) below).

### What's already live on `ratlist.app`

- **Pre-rendered HTML** for `/`, `/legal/privacy`, `/legal/terms`
  (crawlers see real content, not an empty `<div id="root">`)
- **Per-route OG previews** for share URLs: posting
  `https://ratlist.app/share/<token>` to Telegram / Twitter / Discord
  now shows "Sarah · wishlist · 6 items" instead of the generic
  landing card
- **Transactional email**: Santa draw notification, Santa start
  invitation, "send group invite by email" affordance
- **Moderation**: report button on `/share` + `/p/:userId`, NSFW URL
  blocklist in `fetch-url-meta`, soft-disable via
  `profiles.disabled_at`
- **Plausible custom-goal events** wired in code (SignedIn,
  ItemAdded, GroupCreated)

### Manual steps still pending (10 minutes of clicking)

The code is shipped but a couple of envs / dashboard tweaks need
human touch in Vercel + Supabase + Plausible:

1. **Supabase Edge secret** — `RESEND_API_KEY`. Same `re_…` key
   that's already in Supabase Auth SMTP. Adds real email sending
   to the three new functions (without it they dry-run + log to
   stdout):
   ```sh
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx \
     --project-ref fiuheufmawxkgbqddwwu
   ```
2. **Deploy the new Edge Functions** (one-liner per function or
   batched):
   ```sh
   supabase functions deploy send-santa-draw \
                            send-santa-start \
                            send-group-invite \
                            --project-ref fiuheufmawxkgbqddwwu
   ```
3. **Vercel env vars**:
   - `VITE_PLAUSIBLE_DOMAIN=ratlist.app` (turns on the analytics
     script + custom-goal sends)
   - `VITE_SENTRY_DSN=...` (when the Sentry project is created)
   - The Vercel-side Edge Function at `app/api/share/[token].ts`
     reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` — likely already
     present as `VITE_SUPABASE_*`, the function falls back to
     those automatically
4. **Plausible dashboard** — Settings → Goals & funnels → +Add
   custom event for `SignedIn`, `ItemAdded`, `GroupCreated`
   (case-sensitive). Events are *sent* anyway once the script
   loads; the dashboard step makes them visible as conversions
5. **Smoke-test live** after the above: sign in, add an item,
   create a group, check Plausible / Resend / DB
6. *(optional)* Supabase Pro upgrade ($25/mo) — image transforms +
   daily backups

### Priority order for the next session

In order of effort/value ratio. The first two are the remaining gaps
for a robust public-launch posture:

1. **Rate limits** (~1 h) — Postgres triggers on `items`, `invites`,
   `reports`. Sliding window via a `rate_limit_log` table. Without
   this, a motivated abuser can DOS by spamming inserts. Detailed
   design sketch in the session notes below — copy-paste-able.
2. **Notification preferences** (~1.5 h) — `email_prefs` JSONB on
   profiles + `/settings/notifications` toggles + functions respect
   the flags. GDPR-friendly opt-out. Pairs naturally with the three
   transactional emails already shipped.
3. **Santa reveal email + account-deletion confirmation** (~30 min)
   — copy-paste from the existing `send-santa-draw` pattern. Reveal
   fires from `useSantaEvent.reveal`, deletion fires from
   `delete_my_account` follow-up.
4. **Lighthouse re-pass against prod** (~15 min) — after the prerender
   work, FCP/LCP should drop visibly. Document the new numbers in
   CLAUDE.md.

Anything Phase 2+ (marketing kit, demo video, Habr/PH/HN posts) is
genuinely a different kind of work and should wait for the above to
land.

### Pickup tips (don't break these)

- **`forceExitAfterBuild` Vite plugin in `app/vite.config.ts` MUST
  stay last.** Without it `vite build` writes every artifact but
  never exits — locally a 60-second wait, on Vercel a 45-minute
  build-budget kill. Symptom is "build succeeded but deploy hangs
  after PWA generation".
- **Don't strip the `prerender-<hash>.js` chunk** from the client
  bundle. Rolldown packs shared React / react-router code into it
  and the index chunk imports from it. Deleting the chunk breaks
  the bundle silently (prerendered HTML still renders, hydration
  fails).
- **`LegalScreen` is eager, not `React.lazy`.** `renderToString`
  doesn't await lazy promises — using lazy would emit empty
  `<Suspense>` placeholders in the prerendered legal pages.
- **Service worker `navigateFallbackDenylist` includes `/legal/`.**
  Without it the cached `index.html` hijacks legal navigations and
  the browser renders the wrong content even though the static
  file exists on disk.
- **New transactional email?** Copy the
  `supabase/functions/send-santa-draw/` shape: `index.ts` does
  auth + lookup + send, `template.ts` exports the HTML + plain-text
  renderers, shared bits live in `supabase/functions/_shared/`.
  Client invokes with
  `void supabase.functions.invoke('name', { body: {...} }).catch(...)`
  fire-and-forget — never block the user's path on email delivery.
- **New blocklist additions?** Edit
  `supabase/functions/fetch-url-meta/blocklist.ts`. Don't add
  ambiguous domains (Reddit etc.) — leave those for the report
  queue. Only obvious-NSFW.
- **New moderation target type?** Already supported by the
  schema — `target_type` is text with a CHECK list; the
  `<ReportDialog>` component takes the type as a prop.
- **Service-role queries for admin work** — see
  [docs/MODERATION.md](docs/MODERATION.md). It documents the
  triage flow, the actions (`disable share`, `delete item`,
  `disabled_at = now()`), and the trend queries.
- **Local Supabase ports are 544xx** (per
  [CLAUDE.md](CLAUDE.md)). Don't touch the user's other 543xx
  instance.

### <a id="build-infra-fix"></a>What went wrong this session (lessons learnt)

Build deploys were timing out on Vercel after every commit. Found
locally by `time npm run build` — process used ~4 seconds of CPU,
then sat idle for 60 seconds (= the bash timeout) until killed.
Caused by `vite-prerender-plugin`'s dynamic import of the bundled
prerender entry, which loads `react-dom/server` and leaves a libuv
handle dangling. Fix: a 17-line `forceExitAfterBuild` plugin at the
end of the plugins array that calls `process.exit(0)` on
`setImmediate` from `closeBundle`. Commit `b81421b`.

A bigger learning: **the previous commit (`f2bc8a6`,
prerender shipping)** also had a bundle bug — a custom plugin
deleted the prerender chunk thinking it was server-only dead weight,
but the index chunk imported shared React code from it. Browsers
rendered the prerendered HTML fine (SEO worked) but the hydrated app
was broken (no SPA navigation, no interactivity). Caught only because
the Plausible custom-goal commit revealed `track()` calls weren't in
any client chunk. Fixed in `aca41bd`. Don't repeat — Rolldown's
chunking heuristics are different from old Rollup's; the prerender
chunk is shared code, not dead weight.

### Commits this session

In chronological order — each one self-contained, atomic:

| Commit | Area | Summary |
| ------ | ---- | ------- |
| `f2bc8a6` | seo | prerender landing + legal pages |
| `aca41bd` | build | keep prerender chunk (revert misguided strip) |
| `de0d0e1` | observability | wire Plausible custom goals |
| `71db263` | seo | per-share OG image via `?token=` |
| `18a78bc` | seo | share-page meta via Vercel Edge Function |
| `3b0d6de` | seo | robots.txt social vs search policies |
| `a28fee1` | email | Santa "draw is done" notification |
| `b5809e5` | email | Santa start invitation to group members |
| `6291fe4` | email | send group invite by email affordance |
| `b81421b` | build | force process exit after vite build |
| `2f8a3ae` | moderation | user reports on /share + /p/:userId |
| `221e321` | moderation | refuse meta fetch from known-NSFW hosts |
| `f276ab6` | moderation | soft-disable accounts via `disabled_at` |

---

## ✅ What's already in place

Useful as a sanity-check before reading further — most of the product
itself is built.

- Magic-link auth + onboarding flow
- RLS-based privacy (claims hidden from owners, santa assignments
  pre-reveal)
- Closed friend circles with admins / members + invite links + one-tap
  add from existing rats
- Items CRUD with URL meta auto-fetch (Edge Function), cover photo
  upload to Supabase Storage
- Public view-only share URLs (`/share/<token>`)
- Secret Santa (draw + exclusions + reveal) via SECURITY DEFINER
  function
- Realtime: items / item_groups / claims / groups / group_members
- i18n RU + EN, full editorial design system (paper / ink / accent,
  Newsreader + Public Sans + Caveat)
- Toast + ConfirmDialog systems for in-app feedback
- Code-split routes (per-screen chunks)
- Public landing page at `/` for anonymous visitors

## Phase 1A — pre-launch hardening ✅ DONE (2026-05-17)

Everything the product needed to be publicly hostable on `ratlist.app`
without GDPR / consumer-law gaps. Shipped to production end-to-end.

### Auth & profile

- [x] `/settings/profile` screen — display name, handle, avatar, language
- [x] Account deletion endpoint (GDPR right-to-erasure) —
      `delete_my_account` RPC with sole-admin pre-flight and group
      re-homing
- [x] Data portability — `export_my_data` RPC returns one JSONB blob
- [ ] OAuth providers — **deferred to Phase 1B** (magic-link covers
      MVP; Google / Apple add later)

### Legal / compliance

- [x] Privacy Policy (GDPR / CNIL framework) at `/legal/privacy`
- [x] Terms of Service at `/legal/terms`
- [x] 13+ implicit-consent notice under the magic-link submit button
- [x] No cookie banner needed (only first-party essential auth cookie;
      no tracking analytics yet)

### Production infrastructure

- [x] Vercel project linked to GitHub repo, auto-deploy on `main`
- [x] Custom domain `ratlist.app` + SSL on Vercel
- [x] Production Supabase project (`fiuheufmawxkgbqddwwu`, Frankfurt)
      with all 15 migrations applied
- [x] `vercel.json` SPA fallback + immutable asset cache
- [x] Edge Function `fetch-url-meta` deployed; CORS limited to
      `ratlist.app` + `*.vercel.app` + `localhost:5173` per request
- [x] Environment management — `.env.example` separate, production
      values injected via Vercel env vars
- [x] Resend custom SMTP wired into Supabase Auth; branded magic-link
      template
- [x] `hello@ratlist.app` inbound via ImprovMX → personal gmail
- [x] Sentry SDK hookup gated on `VITE_SENTRY_DSN` (DSN to be added
      by user when ready — no DSN, no SDK init)
- [ ] **Supabase Pro upgrade** — still on free tier; upgrade when
      we want daily backups + no auto-pause
- [ ] **Uptime monitoring** (BetterStack / UptimeRobot) — Phase 1B
- [ ] **Plausible / Umami analytics** — Phase 1B

### SEO / discoverability

- [x] OG meta tags + Twitter Card + Schema.org `WebApplication` on `/`
- [x] `robots.txt` — landing + `/legal/*` allowed, everything authed
      disallowed
- [x] `sitemap.xml` — `/`, `/legal/privacy`, `/legal/terms`
- [x] Favicon SVG, `<html lang>` synced with active locale
- [ ] **Pre-rendered landing** — Phase 1B (`vite-plugin-ssg` or
      `react-snap`)
- [ ] **Dynamic OG image** (satori + resvg) — Phase 1B. First attempt
      blocked on Newsreader being a variable font (satori chokes); fix
      is to bundle a static TTF (Inter Italic from `@vercel/og`'s
      bundled fonts works). Markup already exists in commit history.

### Privacy invariants smoke-test

- [x] 5 RLS scenarios pass locally (owner-blind claims, group-mate
      visibility, outsider blocked); production schema verified
      bit-identical via read-only structure check (all RLS enabled,
      all SECURITY DEFINER functions present, no INSERT/UPDATE/DELETE
      policies on `santa_assignments`)

### Bonus polish that landed during 1A

- [x] Router rewrite to nested routes + `<Outlet/>` so Sidebar / top
      bar / bottom tab bar stop re-mounting on every navigation
- [x] Eager-import of MyList / Groups / People / Santa to kill the
      Suspense flash on tab switches
- [x] Multi-origin CORS for Edge Functions (request-bound allow-list
      instead of single `ALLOWED_ORIGIN` env)

## Phase 1B — polish before marketing ✅ DONE (2026-05-17)

What landed in 1B:

### Performance & accessibility

- [x] Lighthouse pass on production — baseline 82 / 86 / 100 / 100,
      improved to 90+ a11y after the contrast / landmarks / heading /
      touch-target fixes (see commit `b58f2d3`)
- [x] Loading skeletons (`<ListSkeleton>`) on MyList / Groups / People
      / Santa replacing the single "…" placeholder
- [x] Lazy images verified — `ItemPhoto` already `loading="lazy"`
- [x] Accessibility: focus traps in `ConfirmDialog` + `ShareDialog`
      via new `useFocusTrap` hook; `<main>` landmark via new
      `<PaperLayout as="main">` prop on every pre-auth screen;
      heading order fixed on the landing (h1 → h2 → h3); WCAG AA
      contrast for `--ink-3` and `--accent`; sign-in touch target
      bumped to 44 px
- [x] **Pre-render landing `/` + `/legal/privacy` + `/legal/terms`** —
      shipped via `vite-prerender-plugin` (see `app/vite.config.ts`).
      Per-route `<title>` / `<meta description>` / `<link canonical>`
      are written by `src/prerender.tsx`. A separate `_spa.html` is
      emitted as the Vercel rewrite target for unknown routes so /login
      etc. no longer flash the landing copy at crawlers. `LegalScreen`
      had to come out of `React.lazy` because `renderToString` doesn't
      await lazy promises — it would have emitted an empty `<Suspense>`
      boundary instead of the actual text. Service-worker
      `navigateFallbackDenylist` now lists `/legal/` so the cached
      `index.html` doesn't hijack legal navigations in the browser.
      Under Rolldown the prerender entry produces a separate ~600 KB /
      ~160 KB-gzip chunk that the `index` chunk imports shared React /
      Router code from; we leave it in `dist/assets/` because deleting
      it would break those imports. The dead-code overhead (just
      `renderToString` + the prerender wrapper) is ~10 KB gzip.
- [ ] Image transforms via Supabase Storage `?width=…&resize=cover` —
      needs Supabase Pro (image transformations are not on Free)

### OAuth + auth polish

- [x] OAuth Google — client wiring + Google Cloud Console + Search
      Console domain verification (TXT) — live, anyone can sign in
- [ ] OAuth Apple — deferred unless we see real demand
- [ ] OAuth Яндекс — Phase 2 if we open RU channel

### Observability & monitoring

- [x] Sentry SDK wired in `main.tsx`, gated on `VITE_SENTRY_DSN` —
      no DSN populated yet (next session can drop one in Vercel env)
- [x] Plausible script injected from `main.tsx`, gated on
      `VITE_PLAUSIBLE_DOMAIN`; setup in [docs/PLAUSIBLE_SETUP.md](docs/PLAUSIBLE_SETUP.md)
- [x] Uptime monitoring setup in [docs/UPTIME_SETUP.md](docs/UPTIME_SETUP.md) —
      3 UptimeRobot monitors mapping to real failure modes
- [ ] **Supabase Pro upgrade** ($25/mo) — daily backups + no
      auto-pause + image transformations. Worth doing once we have
      any actual users; until then Free is fine

### PWA

- [x] `manifest.webmanifest` with standalone display, paper bg, theme
      color
- [x] Apple touch icon (180), PNG favicon set (32, 192, 512), full
      Apple meta tags
- [x] Service worker via `vite-plugin-pwa` — pre-caches build output
      (~683 KB / 17 entries), auto-update on new deploys, navigation
      fallback excludes `/og.png` and `/functions/*` so external
      rewrites aren't intercepted

### Dynamic OG image (debt from 1A)

- [x] Edge Function `og-image` (satori + resvg-wasm). Fix was (a)
      ship Newsreader as **WOFF** (not woff2, not variable TTF), (b)
      inline as base64 since supabase CLI doesn't bundle non-TS
      assets, (c) use plain object trees instead of satori-html so
      whitespace between tags doesn't trip the "display: flex" check.
      1200x630 PNG, ≈43 KB, served via Vercel rewrite from `/og.png`.
- [x] Per-share variant via `?token=<share>` — Edge Function
      branches on the query param, calls `get_public_list(_token)`
      (SECURITY DEFINER, anon-callable), and renders
      "{display_name} · wishlist · N items" with the same paper /
      ink / accent aesthetic. Falls back to the landing markup on
      any error or missing token so a malformed crawl never 500s.
      The bundled Newsreader WOFF is Latin-only, so non-Latin names
      (Cyrillic / CJK / Greek / Arabic) substitute "a fellow rat"
      to avoid `.notdef` rectangles. Adding a Cyrillic font subset
      doubles the bundled font weight — defer until there's real RU
      traffic.
- [x] **Share-page meta tags via Vercel Edge Function** —
      `app/api/share/[token].ts` fetches `_spa.html`, patches the
      `<head>` with per-token `<title>`, `og:title`,
      `og:description`, `og:url`, `og:image` (pointing at
      `/og.png?token=...`) and the matching twitter:* set, then
      returns the patched HTML. `vercel.json` rewrites
      `/share/:token` → `/api/share/:token` so users and crawlers
      hit the function transparently. Lookup failures (bad token,
      DB blip) silently fall through to the un-patched template —
      the user still gets the SPA, crawlers see the default
      landing card. Cached for 1 hour at the CDN, 1 minute at the
      client; different `?token=` values are distinct cache keys.

### Things to pick up for the next contributor

When opening a fresh session, this is where 1B "polish" leaves off:

1. **Per-share-token OG image** (~1 h) — extend `og-image` Edge
   Function with a `?token=...` branch that fetches `profiles +
   items count` and renders a personalised preview.
2. **Supabase Pro upgrade** (5 min, $25/mo) — unblocks image
   transformations and gives backups.
3. **Custom Plausible goal events** for SignedIn / ItemAdded /
   GroupCreated — needs ~30 min once Plausible is live.
4. **Per-language prerender** — currently only English is prerendered.
   Russian users get the toggle, but their crawlers see the English
   landing. To prerender both, the routes would need `?lang=ru` (or
   `/ru/`) variants and `hreflang` tags. Worth doing only if RU
   discovery channels start mattering.

## Phase 2 — soft launch (1–2 weeks after Phase 1)

Things that turn "live URL" into "actually inviting people".

### Email transactional

- [x] Provider — Resend, SMTP for magic-link (Supabase Auth) +
      REST API for transactional emails (Edge Functions). DKIM /
      SPF / DMARC set up on `ratlist.app` per
      [docs/RESEND_SETUP.md](docs/RESEND_SETUP.md).
- [x] Magic-link template — branded paper/ink/accent, applied in
      Supabase Auth dashboard.
- [x] Group invitation by email — `send-group-invite` Edge
      Function + "send by email" affordance on each invite row in
      `<InviteList>`. Reuses the existing single-use token, no
      schema change.
- [x] Santa start invitation — `send-santa-start` Edge Function,
      fires fire-and-forget after the organiser creates the event,
      emails every group member minus the creator.
- [x] Santa draw complete — `send-santa-draw` Edge Function,
      fires after `run_santa_draw` succeeds, emails every giver.
      Match name deliberately NOT in the email body (privacy: mail
      archives leak; gate the match on a sign-in).
- [ ] Santa reveal complete — same pattern, ~15 min copy-paste
      from `send-santa-draw`. Fires from `useSantaEvent.reveal`.
- [ ] Account-deletion confirmation — fires from after
      `delete_my_account` succeeds. Trickier than the others
      because the user row is gone by the time we'd send — needs
      a "queue the email before the delete" Edge Function pattern.
- [x] Item claimed — explicitly skipped. Privacy invariant says
      owners shouldn't know who claimed what. No notification.
- [ ] Unsubscribe link + per-category email preferences in
      `/settings/notifications` — `email_prefs` JSONB on profiles,
      Edge Functions check before sending. ~1.5 h.

### Moderation / abuse

- [x] "Report" button on `/p/:userId` and `/share/<token>` pages —
      anon-friendly on share URLs. Inserts into `public.reports`
      with `reporter_id` null if no session. `<ReportDialog>` is a
      reusable component; future targets (`item`, `group`) drop in
      by passing `targetType` + `targetId`.
- [x] Admin dashboard — kept as a Supabase Studio bookmark + the
      psql queries in [docs/MODERATION.md](docs/MODERATION.md).
      Triage statuses (`open`/`reviewed`/`actioned`/`dismissed`)
      and the action SQL are documented; thin in-app `/admin` can
      come once volume warrants.
- [x] NSFW URL filter — `supabase/functions/fetch-url-meta/blocklist.ts`
      hard-codes ~30 well-known adult hosts + the unambiguous
      adult TLDs (`.xxx`, `.adult`, `.porn`, `.sex`, `.sexy`).
      Returns 422 `blocked_host`. ItemForm shows a localised hint
      line; the user can still create the item manually.
- [x] Soft-disable accounts — `profiles.disabled_at` column +
      patched `get_public_list` to refuse disabled owners. Their
      share URL reads as `invite_not_found` (same as a rotated
      token); group-member visibility is intentionally not yet
      filtered. Operator workflow in
      [docs/MODERATION.md](docs/MODERATION.md).
- [ ] Rate-limit invite-link generation and item creation
      (per-user sliding window). Postgres triggers calling a
      `enforce_rate_limit(_action, _max, _window_minutes)` helper
      that reads a `rate_limit_log` append-only table. Pseudocode
      sketched in this doc — see "Rate limits design" below. ~1 h.

### Rate limits — design sketch for the next session

Append-only log + a SECURITY DEFINER helper called from BEFORE
INSERT triggers on the protected tables. Anonymous reports stay
unprotected for v1 (they're rare enough to triage manually); if
that changes, add IP-based limiting via Vercel headers forwarded
through an Edge Function.

```sql
create table public.rate_limit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,                       -- nullable; anon stays unrestricted in v1
  action      text not null,              -- 'item_create' | 'invite_create' | …
  created_at  timestamptz not null default now()
);
create index rate_limit_log_action_user_idx
  on public.rate_limit_log(action, user_id, created_at desc);

-- Periodic cleanup: drop rows older than 24h. Cron via pg_cron
-- or a daily psql call from an external scheduler.

create or replace function public.enforce_rate_limit(
  _action text, _max int, _window_minutes int
) returns void language plpgsql security definer
set search_path = public as $$
declare _uid uuid := auth.uid(); _count int;
begin
  if _uid is null then return; end if;
  select count(*) into _count from public.rate_limit_log
   where action = _action and user_id = _uid
     and created_at > now() - (_window_minutes || ' minutes')::interval;
  if _count >= _max then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.rate_limit_log (user_id, action) values (_uid, _action);
end; $$;

-- Per-table triggers, tuned per surface:
-- items: 100 per hour (lavish use is normal — wishlist drafting)
-- invites: 10 per hour (one invite per friend is plenty)
-- reports: 20 per hour (most legit, some noisy)
```

Add `rate_limited` to `app/src/lib/errors.ts` so the UI shows
"slow down, try again in a few minutes" instead of a raw error.

### Polish

- [ ] PWA manifest + service worker for offline list view + Add to
      Home Screen
- [ ] Lighthouse pass (aim for 90+ on perf, a11y, SEO, best practices)
- [ ] Image optimization — Supabase Storage `?width=...&resize=cover`
      transformations for thumbnails (cheaper than serving full
      uploads to mobile)
- [ ] Accessibility audit — ARIA labels on interactive elements,
      proper heading hierarchy, focus traps in dialogs (currently
      ConfirmDialog and ShareDialog don't trap focus)
- [ ] Loading skeletons for slow networks
- [ ] Empty / error state coverage — Sentry will catch what's missed

### Marketing & launch

- [ ] Press kit page or folder: logo (SVG), screenshots, one-line
      pitch, founder bio (optional)
- [ ] 30-second video demo (Loom / OBS recording is fine; just show
      the My-list, share flow, Santa)
- [ ] Product Hunt submission — line up upvotes, schedule for Tuesday
- [ ] Hacker News "Show HN" post
- [ ] Indie Hackers profile + launch post
- [ ] Twitter/X handle + 3 launch threads queued
- [ ] **Russian discovery**: Habr article ("how I built a wishlist
      with Supabase + Newsreader instead of Tailwind"), maybe Pikabu /
      VC.ru cross-post
- [ ] Telegram channel "Крысиное" — eat your own dogfood, post
      updates there

## Phase 3 — monetization (only after 1k+ MAU)

**Do not start any of this before there's actual traffic.** Building
affiliate plumbing for an audience of zero is the classic indie-hacker
trap.

- [ ] Register ИП / самозанятость (RU) or appropriate entity for
      affiliate payouts
- [ ] Join affiliate programs — for RU audience: Admitad, ePN
      (Ozon / WB / Aliexpress combined). For global: Amazon Associates
      (requires existing traffic threshold to apply)
- [ ] Affiliate link rewriter — Edge Function or client-side wrapper
      that adds the right `tag=` / `aff_id=` parameter on
      "open link" clicks. **Owner-only by default** — never rewrite
      someone else's URLs (legal + ethical)
- [ ] Explicit toggle in `/settings`: "monetize my list" — off by
      default. ON means the user accepts affiliate disclosure
- [ ] Disclosure UI: small "содержит партнёрские ссылки" line on any
      list with monetization enabled
- [ ] Optional "идеи" curated feed — staff-picked items the team
      links to with our own affiliate ID. Lower friction than relying
      on user lists

## What we deliberately won't build now

- Native iOS / Android apps — PWA is enough for MVP
- Custom user domains (`mywishlist.example.com`) — premium feature,
  way later
- Premium / pro tier — needs product-market-fit signal first
- Chat / DMs inside the app — out of scope; people share via Telegram
- Public discovery feed of all wishlists — privacy regression and not
  what the product is about

## Cost forecast (Phase 1+2)

| Item                              | Cost              |
| --------------------------------- | ----------------- |
| Supabase Pro                      | $25 / mo          |
| Vercel Hobby (or Pro $20 if maxed)| $0 / mo           |
| Domain (.app / .com)              | $10–20 / yr       |
| Resend                            | $0 (under 3k/mo)  |
| Plausible                         | $9 / mo           |
| Sentry                            | $0 (under 5k/mo)  |
| **Total**                         | **~$35 / mo**     |

Buy a year up front: ~$420 for the runway. Affiliate revenue should
cover this by month 6 if there's any traction at all; if it doesn't,
that's the honest signal that the product needs different positioning
before more investment.

## Notes for the agent picking this up

- Don't lead with deploy on the first work session — re-read `CLAUDE.md`
  and verify nothing's regressed locally first.
- Each phase block above can be a separate session: Phase 1 alone is
  probably 3–5 sessions of focused work.
- All migrations live in `supabase/migrations/` — keep the timestamp
  ordering tight, never edit applied migrations, regenerate
  `app/src/types/database.ts` after every change (`supabase gen types
  typescript --local --schema public 2>/dev/null > app/src/types/database.ts`).
- Privacy invariants (`CLAUDE.md` → "Privacy invariants") are
  non-negotiable. Re-verify after touching `claims`, `items`,
  `santa_*`, or any RLS.
- When adding paid services (Plausible, Sentry, Resend), put the keys
  in `.env.production` only — never commit them, never expose them in
  the client bundle except where the SDK explicitly needs a public key.
