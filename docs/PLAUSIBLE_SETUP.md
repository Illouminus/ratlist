# Plausible analytics — setup

Code is wired up — when `VITE_PLAUSIBLE_SCRIPT_ID` is set in the
Vercel production env, `main.tsx` installs the queue stub and
injects Plausible's per-site loader script on first render. This
doc covers the manual half: creating the Plausible account, adding
the site, and dropping the script ID into Vercel.

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
4. Plausible shows the snippet to install. The script src looks
   like `https://plausible.io/js/pa-<long-id>.js` — copy just the
   `pa-<long-id>` part (without `.js`). That's your site's
   `VITE_PLAUSIBLE_SCRIPT_ID`. The init JavaScript next to it is
   the standard Plausible bootstrap; our `initPlausible()` in
   `app/src/lib/plausible.ts` reproduces it exactly, so no manual
   `<script>` paste is needed.

## 2. Plug into Vercel

1. Vercel → Project → Settings → Environment Variables
2. Add:
   ```
   Name:  VITE_PLAUSIBLE_SCRIPT_ID
   Value: pa-shRef6EUUr7_B4DMvcoSa     (the exact ID from your snippet)
   Env:   Production (and Preview if you want preview deploys tracked
          separately — usually leave off so test traffic doesn't
          inflate stats)
   ```
3. Trigger a redeploy. Open https://ratlist.app, then click
   "Verify installation" in Plausible — within ~10 seconds it
   should flip from "We couldn't detect Plausible on your site" to
   confirmed.

> If you previously set `VITE_PLAUSIBLE_DOMAIN`, you can delete it.
> The new per-site loader encodes the domain in the script ID, so
> the old env var is ignored.

## 3. (Optional) DNS proxy for ad-blockers

Some ad-blockers (uBlock Origin's default list) block
`plausible.io/js/*`. If you want to see those visits too, Plausible
offers a **custom domain proxy**: load the script from
`stats.ratlist.app` instead. Setup:

1. Plausible → Settings → Custom domain → enter `stats.ratlist.app`
2. Vercel DNS → add CNAME `stats` → `custom.plausible.io`
3. Edit `initPlausible()` in `app/src/lib/plausible.ts` and swap
   the host: `https://stats.ratlist.app/js/${scriptId}.js`

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

The wrapper is a no-op when `VITE_PLAUSIBLE_SCRIPT_ID` is unset
(no Plausible script loaded) so call-sites don't need to guard.
The goal list is closed in TypeScript — add an entry to
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
