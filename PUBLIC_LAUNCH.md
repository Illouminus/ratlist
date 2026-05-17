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

## Phase 1 — pre-launch hardening (1–2 weeks)

Things the product genuinely cannot ship without. Order roughly by
dependency.

### Auth & profile

- [ ] OAuth providers (Google + Apple at minimum; consider Яндекс for
      RU audience). Supabase has this built-in, mostly config + Apple
      sign-in setup
- [ ] `/settings/profile` screen: change display_name, handle, upload
      avatar, delete account button
- [ ] Account deletion endpoint (GDPR "right to be forgotten") —
      SECURITY DEFINER RPC that cascades through claims / items /
      group_members / santa_*. Plain `auth.admin.deleteUser` won't
      cascade gracefully

### Legal / compliance

- [ ] Privacy Policy (template-generated is fine for MVP; mention
      Supabase as sub-processor, list cookies, retention policy)
- [ ] Terms of Service (likewise; cover acceptable use, account
      termination, jurisdiction)
- [ ] Cookie banner (only if shipping to EU — Supabase auth uses
      first-party cookies which are essential, so we can skip the
      consent flow for those, but tracking analytics needs consent)
- [ ] 13+ age gate at signup (COPPA + GDPR-K)
- [ ] If affiliate later — disclosure banner per Russian 38-ФЗ
      «О рекламе» and FTC guidelines

### Production infrastructure

- [ ] Pick a frontend host (Vercel / Fly / Cloudflare Pages — Vercel
      Hobby is fine to start)
- [ ] Upgrade Supabase to **Pro tier** (~$25/mo) for daily backups,
      no auto-pause, custom domains
- [ ] Custom domain (буду рад если ratlist.app свободен) + SSL
- [ ] Edge functions deployed to production (the fetch-url-meta one
      needs CORS allow-list set to the production domain)
- [ ] Environment management — `.env.production` separate from local;
      anon key + URL injected at build time
- [ ] Error monitoring: Sentry (free tier — 5k events/mo)
- [ ] Privacy-respecting analytics: Plausible / Umami (paid ~$9/mo) or
      self-host. **No Google Analytics** — it'd contradict the no-ads
      positioning of the landing page
- [ ] Uptime monitoring: BetterStack or UptimeRobot free tier

### SEO / discoverability

- [x] OG meta tags on `/` (title, description, Schema.org). og:image
      deliberately deferred — see "Dynamic OG image" in Phase 1B
- [x] `robots.txt` — landing + `/legal/*` allowed, everything authed
      disallowed
- [x] `sitemap.xml` — `/`, `/legal/privacy`, `/legal/terms`
- [x] Structured data (Schema.org `WebApplication`) on landing
- [ ] **Pre-rendered landing** — SPA Google indexing works but slow.
      Two options: (a) Vercel's `getStaticProps`-equivalent if
      switching to Next.js, (b) `vite-plugin-ssr` / `prerender` for
      just `/`. Path (b) is less work.
- [ ] **Dynamic OG image** (satori + resvg) for landing + per-share-
      token previews. First attempt blocked on Newsreader being a
      variable font (satori chokes), so deferred — pick a known-good
      static TTF (Inter Italic from `@vercel/og`'s bundled fonts, or
      bundle a static Newsreader variant) and reuse the markup that
      already lives in commit history.

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
