# Uptime monitoring — setup

No code to write — uptime monitoring is fully external. This is a
~10-minute manual checklist to subscribe to "did the site stop
responding?" alerts and have one panel to look at when something
feels off.

---

## Pick a provider

| Provider | Free tier | Why pick it |
| --- | --- | --- |
| **UptimeRobot** | 50 HTTP(S) monitors, 5-min interval, email/webhook alerts | Battle-tested, simplest UI, fine forever for our scale |
| **BetterStack** (Better Uptime) | 10 monitors, 3-min interval, includes status-page | Nicer status page if we want one |
| **Cron-job.org** | Unlimited HTTP(S), 1-min interval, basic alerts | Bare-bones but actually unlimited free |

Recommendation: **UptimeRobot** for the soft launch. Migrate to
BetterStack only if you want a public status page later.

## UptimeRobot — quick setup

1. Sign up at https://uptimerobot.com (Google sign-in is fastest).
2. Dashboard → **Add New Monitor**:
   - Monitor Type: `HTTPS`
   - Friendly Name: `Rat List — landing`
   - URL: `https://ratlist.app`
   - Monitoring Interval: 5 minutes
   - Save.
3. Add a second monitor for the Supabase health endpoint so a DB or
   auth outage is visible separately:
   - Monitor Type: `HTTPS`
   - Friendly Name: `Rat List — Supabase health`
   - URL: `https://fiuheufmawxkgbqddwwu.supabase.co/auth/v1/health`
   - Monitoring Interval: 5 minutes
4. Add a third for the OG image renderer — it's the most fragile
   bit of our stack (cold-start + WASM + font decode):
   - Monitor Type: `HTTPS`
   - Friendly Name: `Rat List — og-image`
   - URL: `https://ratlist.app/og.png`
   - Monitoring Interval: 30 minutes (it's cached at the edge,
     5-min would just thrash it)
5. **My Settings → Alert Contacts** → add `edouard.baillot@gmail.com`
   (already default if you signed up with that email).
6. Each monitor → **Alert Contacts to Notify** → tick the email
   contact + escalate after first failure. UptimeRobot's default is
   alert after a single 30-second failure, which is too sensitive
   for free-tier supabase auto-pause; consider editing each monitor
   to "alert after 2 consecutive failures" so a brief blip doesn't
   page you.

## Optional: status page

UptimeRobot free gives a public status page. Useful if you ever
want to point users there during incidents. Settings → Public Status
Pages → Add — pick which monitors to expose.

For now skip — there's no audience.

## What "down" actually means

Three reasonable failure modes to keep separate in your head:

- **Vercel down** — landing 5xx. Rare (Vercel SLA is high). Affected:
  everything.
- **Supabase down or paused** — auth + DB unreachable. Free-tier
  projects auto-pause after a week of zero traffic; the first
  pageview after a pause kicks them back up but **the user that
  visited gets a broken page**. → mitigation: upgrade to Pro
  ($25/mo) once we have any real users.
- **OG image renderer down** — only social previews break, not the
  app itself. Often a cold-start hiccup; the second crawl from the
  same platform usually succeeds.

The three monitors above map 1:1 to these failure modes — when one
of them pages you, you know immediately where to look.
