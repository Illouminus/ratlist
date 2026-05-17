# Plausible analytics — setup

Code is wired up — when `VITE_PLAUSIBLE_DOMAIN` is set in the Vercel
production env, `main.tsx` injects the Plausible script on first
render. This doc covers the manual half: creating the Plausible
account, adding the site, and dropping the domain into Vercel.

---

## Why Plausible

- **Cookie-less by design** — no consent banner needed, no GDPR /
  ePrivacy headaches. Our Privacy Policy already lists Plausible
  as a sub-processor.
- **EU-hosted by default** (Plausible's own infra, Frankfurt).
- **Lightweight** — < 1 KB script vs ~50 KB for the GA tag.
- **Page-views + UTM + referrers + outbound links** is enough for
  early growth signals.

If you want zero recurring cost, self-host **Umami** instead — same
philosophy, same code wiring (just swap the script URL). For
soft-launch volume Plausible's $9/mo "10k pageviews" plan is
plenty.

## 1. Sign up + add the site

1. Open https://plausible.io and sign up (the auto-entrepreneur
   billing details from Resend work here too, French TVA invoices).
2. Choose plan **Growth → 10k pageviews / $9 mo** (cheapest paid
   tier — the free trial is fine to start).
3. **Add a site**:
   - Domain: `ratlist.app`
   - Timezone: Europe/Paris (matches your tz; affects dashboard
     time bucketing only)
4. Plausible shows the snippet to install. You don't need to copy
   it — `main.tsx` already constructs the same `<script>` tag
   programmatically.

## 2. Plug into Vercel

1. Vercel → Project → Settings → Environment Variables
2. Add:
   ```
   Name:  VITE_PLAUSIBLE_DOMAIN
   Value: ratlist.app
   Env:   Production (and Preview if you want preview deploys tracked
          separately — usually leave off so test traffic doesn't
          inflate stats)
   ```
3. Trigger a redeploy. Open https://ratlist.app, then check the
   Plausible dashboard — page-view should appear within seconds.

## 3. (Optional) DNS proxy for ad-blockers

Some ad-blockers (uBlock Origin's default list) block
`plausible.io/js/script.js`. If you want to see those visits too,
Plausible offers a **custom domain proxy**: load the script from
`stats.ratlist.app` instead. Setup:

1. Plausible → Settings → Custom domain → enter `stats.ratlist.app`
2. Vercel DNS → add CNAME `stats` → `custom.plausible.io`
3. Update `main.tsx`:
   ```ts
   s.src = 'https://stats.ratlist.app/js/script.js';
   ```

Skip this for soft-launch. Revisit if you suspect significant
ad-block traffic loss in the dashboard.

## Goal events (already wired in code)

The app fires three custom events via the typed wrapper at
`app/src/lib/plausible.ts`:

| Goal           | Fired from                                        | When                                       |
| -------------- | ------------------------------------------------- | ------------------------------------------ |
| `SignedIn`     | `screens/AuthCallbackScreen.tsx`                  | auth status flips to `authenticated` on the callback URL (so it covers magic link + Google OAuth, but skips cached-session restores) |
| `ItemAdded`    | `items/useMyItems.ts` → `createItem`              | items insert succeeds (before the publish-to-groups step, so a partial publish still counts) |
| `GroupCreated` | `groups/useGroups.ts` → `createGroup`             | `create_group` RPC succeeds                |

The wrapper is a no-op when `VITE_PLAUSIBLE_DOMAIN` is unset (no
Plausible script loaded) so call-sites don't need to guard. The
goal list is closed in TypeScript — add an entry to
`PlausibleGoal` before introducing a new event so call-sites can't
typo a name.

To make the events show up in the dashboard's conversion view, the
matching custom event must also exist in Plausible:

1. Plausible → Site settings → **Goals & funnels** → **+ Add goal**
2. Pick **Custom event**
3. Event name: exactly `SignedIn`, `ItemAdded`, or `GroupCreated`
   (case-sensitive — must match what the wrapper sends)
4. Repeat for the other two

Until those goals are added in the dashboard, the events still get
sent and counted, they just aren't surfaced as conversions.

## What stays manual after this

- **Outbound links** — Plausible auto-tracks outbound clicks if
  the file-downloads + outbound-links extension is enabled in the
  site settings. One toggle, no code change.
- **Funnels** — once goals exist, you can chain them
  (`SignedIn` → `GroupCreated` → `ItemAdded`) to see drop-off
  between sign-up and first real use.
