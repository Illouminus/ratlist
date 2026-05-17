# Resend + custom SMTP — production handoff

This is the manual setup checklist for Step 3 of [PUBLIC_LAUNCH.md](../PUBLIC_LAUNCH.md):
hook Supabase Auth into Resend so magic-link emails ship from
`hello@ratlist.app`, with a real DKIM signature and our editorial
template instead of Supabase's default `noreply@*.supabase.co`.

Most of this lives in Resend's and Supabase's web UIs, so it cannot be
done from CLI alone. Allocate ~30 minutes of clicking + DNS
propagation.

---

## 1. Resend account

1. Sign up at https://resend.com (Edouard's account — auto-entrepreneur
   billing details OK for invoices with French TVA intracom).
2. Plan: **Free** is fine until 3k emails/month. Upgrade later if
   needed.

## 2. Verify the `ratlist.app` domain

In Resend dashboard → **Domains → Add Domain**, enter `ratlist.app`.
Resend returns three DNS records:

| Type | Host | Value |
| ---- | ---- | ----- |
| TXT  | `send` (or `_resend`) | provided SPF include |
| TXT  | DKIM selector (long) | RSA public key |
| MX   | `send.ratlist.app` | `feedback-smtp.eu-west-1.amazonses.com` |

Vercel manages our DNS, so add them in **Vercel → Project → Settings →
Domains → ratlist.app → Manage DNS**. Save and wait — propagation is
usually < 1 minute on Vercel.

Click **Verify** in Resend. All three records should turn green.

Optional but recommended: add a DMARC record to harden against
spoofing. Single TXT record:

| Type | Host | Value |
| ---- | ---- | ----- |
| TXT  | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:hello@ratlist.app` |

## 3. API key

Resend → **API Keys → Create API Key**.

- Name: `ratlist-prod`
- Permission: **Sending access only**
- Domain: `ratlist.app`

Copy the key (starts with `re_…`) — Resend only shows it once.

## 4. Hook into Supabase Auth — custom SMTP

Supabase → **Authentication → Emails → SMTP Settings**.

| Field | Value |
| ----- | ----- |
| Enable custom SMTP | **on** |
| Sender name | `Rat List` |
| Sender email | `hello@ratlist.app` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | the `re_…` API key from step 3 |
| Min interval between emails | `1` (default is fine) |

Save. Use the **Send test email** button to fire one at your own inbox.
It should arrive within a few seconds, from `Rat List <hello@…>`, with
the green DKIM/SPF/DMARC passes in the headers.

## 5. Email template

In Supabase → **Authentication → Emails → Templates → Magic Link**:

- **Subject**: `your one-time sign-in link · rat list`
- **Body**: paste the entire contents of
  [`supabase/templates/magic-link.html`](../supabase/templates/magic-link.html)
  into the body field. Save.

The template already uses Supabase's mustache placeholders
(`{{ .ConfirmationURL }}`, `{{ .Email }}`). Inline styles only — no
external resources — so it renders in Gmail and Outlook without further
work.

## 6. Inbound email — `hello@ratlist.app`

Sending out is set up; receiving still needs a forwarder. Resend has no
inbound parsing on the free plan, so use **ImprovMX** (free, generous,
works with any DNS):

1. Sign up at https://improvmx.com
2. Add `ratlist.app` as a domain
3. Add MX records ImprovMX gives you in Vercel DNS:

   | Type | Host | Priority | Value |
   | ---- | ---- | -------- | ----- |
   | MX   | `@`  | 10       | `mx1.improvmx.com` |
   | MX   | `@`  | 20       | `mx2.improvmx.com` |

   Note: ImprovMX MX records are on the apex (`@`), Resend's MX is on
   the `send.` subdomain — they coexist.

4. In ImprovMX → **Aliases**: `hello@ratlist.app → edouard.baillot@gmail.com`.

Test by emailing `hello@ratlist.app` from any other account; it should
land in Gmail within a minute.

## 7. Smoke test the full loop

1. Open https://ratlist.app/login in an incognito window.
2. Enter your real email.
3. Confirm the email arrives from `hello@ratlist.app` with the
   branded template (paper background, italic wordmark, terracotta
   "sign in →" button).
4. Click the link → lands on `/auth/callback` → bounces to `/`.
5. Reply to the email → lands in `edouard.baillot@gmail.com`.

If steps 3-5 all pass, Step 3 of Phase 1A is done.

---

## Troubleshooting

- **DKIM / DMARC failing in Gmail headers**: usually DNS hasn't
  propagated yet. `dig +short TXT _resend.ratlist.app` should return
  the record. Wait 5 minutes, re-test.
- **"Email not allowed"** from Supabase Auth: someone hit the rate limit
  on the default SMTP before custom SMTP was configured. Wait an hour
  or contact Supabase support to clear.
- **Email lands in spam**: Resend has a domain reputation page in the
  dashboard. Common cause: no SPF/DKIM/DMARC on first send. Re-verify
  all three DNS records and send a few more to known inboxes to warm
  the reputation up.

## What stays manual after this

- Switching the email template if we update `magic-link.html` — Supabase
  doesn't sync from the repo automatically; paste-replace each time.
- Future transactional emails (group invitations, Santa events) live
  outside Supabase Auth and would be sent through Resend's REST API
  from an Edge Function. Not in scope for Phase 1A.
