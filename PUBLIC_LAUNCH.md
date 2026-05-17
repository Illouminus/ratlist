# Public Launch — Roadmap

Goal: take Крысиные желания / Rat List from "feature-complete friend-app" to
**publicly hosted product** with a credible path to affiliate monetization.

> This doc is a checklist for a future session. Each item is small enough to
> pick up alone. Ticked items mean "shipped + tested in production"; not
> "code merged locally".

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
- [ ] Future variant: `?token=<share>` for per-list previews
      ("Маша's list — 12 wishes") on `/share/<token>` cards. Markup
      already factored to grow into this; just needs a DB lookup
      for owner display_name + visible item count.

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

- [ ] Pick a provider — Resend is cheapest + cleanest API for our
      scale (free tier 3k emails/mo, then $20/mo). Postmark is the
      alternative
- [ ] Templates:
  - Magic-link sign-in (already from Supabase, can customize sender)
  - Group invitation ("X invites you to «...»")
  - Santa event ("X started a Secret Santa in «...»")
  - Santa draw complete ("the draw is done — see your recipient")
  - Item claimed ("X claimed your *...* — wait, not actually — we
    don't notify the owner; this is a friend-to-friend notification
    instead")
  - Account-deletion confirmation
- [ ] Unsubscribe link + per-category email preferences in
      `/settings/notifications`
- [ ] DKIM / SPF / DMARC on the production domain

### Moderation / abuse

- [ ] "Report" button on `/p/:userId` and `/share/<token>` pages
      (anonymous reporter form for share URLs)
- [ ] Admin dashboard (can be a Supabase Studio bookmark for v1 — no
      need to build UI yet, but document the queries)
- [ ] NSFW URL filter (URLs with known adult-content hosts blocked at
      meta-fetch time) — Edge Function modification
- [ ] Soft-delete / ban: profile `disabled_at` column; RLS skips
      disabled accounts. Auth side: `auth.admin.updateUserById` with
      `banned_until`
- [ ] Rate-limit invite-link generation and item creation (per-user
      sliding window). Already-existing Supabase rate-limits on
      auth.signIn cover most; we'd add Postgres triggers for the
      rest

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
