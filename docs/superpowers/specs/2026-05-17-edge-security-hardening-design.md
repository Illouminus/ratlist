# Edge security hardening — design spec

Date: 2026-05-17
Source: full-project audit run on 2026-05-17 (six parallel Explore agents); see commit log for context.
Bucket: 1 of 3 (siblings: "Test foundation", "Realtime debounce + skip-link polish")

## Problem

A full audit of the Supabase edge functions surfaced four issues, two HIGH and two MED:

1. **SSRF in `fetch-url-meta` (HIGH).** The function validates the URL scheme but not its resolved address. A malicious item URL can probe `http://127.0.0.1`, `169.254.169.254` (cloud-metadata), or RFC1918 ranges. The local Supabase Studio (port 54423) and prod Supabase internal endpoints are reachable from the edge runtime, so a crafted wishlist URL becomes an internal probe.

2. **NSFW blocklist bypass via redirect (HIGH).** The blocklist is checked only against the input hostname. The function then follows redirects with no per-hop recheck and no max-hop limit. `https://clean.example` → 302 → `https://pornhub.com` passes the check, the final NSFW URL is rendered as og:image on `/share/<token>` public pages.

3. **CRLF / header injection in email subjects (MED).** `send-santa-draw`, `send-santa-start`, and `send-group-invite` interpolate user-controlled fields (event name, group name) into the email Subject without sanitizing newlines or control chars. Resend may strip these, but defense-in-depth is cheap.

4. **No idempotency on bulk email (MED).** `send-santa-draw` and `send-santa-start` will re-send to the entire group on retry / double-click. There is no DB-level guard.

`send-group-invite` is **excluded** from idempotency: its semantics intentionally allow re-sending (a recipient legitimately asks for a resend if the first didn't arrive). Header sanitization still applies.

## Goals

- Close both SSRF vectors in `fetch-url-meta` with defense in depth (string check + DNS resolution + per-hop recheck).
- Sanitize all user-controlled inputs in email headers.
- Make `send-santa-draw` and `send-santa-start` safe to retry (at most one mass-mailing per event, with rollback on partial failure).
- Add `deno test` coverage for the helpers introduced here, so the security-critical units cannot silently regress.

## Non-goals

- Generic edge-function rate-limiting (separate Phase 2 work; see PUBLIC_LAUNCH.md).
- A full test/CI foundation (separate brainstorm bucket: "Test foundation").
- Resumable per-recipient retry tracking. On partial Resend failure we roll back the idempotency claim; a retry resends to everyone. Recipients can see one duplicate; acceptable for v0.2.
- A UI "resend draw emails" button. If users request it, add later via a `clear_draw_emailed(event_id)` RPC.
- Changing the existing `send-group-invite` semantics.

## Architecture

Three independent changes inside `supabase/functions/`. None touch the frontend, RLS, or app schema beyond two new nullable columns.

```
supabase/
├── functions/
│   ├── _shared/
│   │   ├── network.ts             # NEW — safeFetch, isPrivateAddress, resolvesToPrivate
│   │   ├── network.test.ts        # NEW
│   │   ├── email.ts               # ADD sanitizeHeaderValue
│   │   └── email.test.ts          # NEW
│   ├── fetch-url-meta/
│   │   ├── index.ts               # CHANGE — replace fetch() with safeFetch()
│   │   └── index.test.ts          # NEW
│   ├── send-santa-draw/
│   │   └── index.ts               # CHANGE — sanitize subject + idempotency claim
│   ├── send-santa-start/
│   │   └── index.ts               # CHANGE — sanitize subject + idempotency claim
│   └── send-group-invite/
│       └── index.ts               # CHANGE — sanitize subject only
└── migrations/
    └── 20260517XXXXXX_santa_email_idempotency.sql  # NEW
```

Plus a root-level `package.json` script `test:edge` to run `deno test`.

## Components

### 1. `_shared/network.ts` — SSRF defense

Three exports:

- **`isPrivateAddress(hostname: string): boolean`** — synchronous string check against IPv4 (`127/8`, `10/8`, `192.168/16`, `172.16/12`, `169.254/16`, `0/8`, `100.64/10` CGNAT) and IPv6 (`::1`, `fe80::/10`, `fc00::/7`) ranges, plus hostnames `localhost`, `*.localhost`, `*.local`, `*.internal`.
- **`resolvesToPrivate(hostname: string): Promise<boolean>`** — calls `Deno.resolveDns(hostname, 'A')` and `Deno.resolveDns(hostname, 'AAAA')`, runs `isPrivateAddress` on each returned IP. Returns true if any resolved IP is private. Catches NXDOMAIN and returns false (let fetch fail naturally with a clear DNS error). Closes the DNS-rebinding vector (`127-0-0-1.nip.io`).
- **`safeFetch(url: URL, opts: { maxHops?: number, timeoutMs?: number }): Promise<Response>`** — manual redirect loop. At every hop, checks (a) protocol is `http`/`https`, (b) hostname is not in the NSFW blocklist, (c) `resolvesToPrivate` is false. Throws `BlockedError(code)` with codes `unsupported_protocol | blocked_host | private_address | too_many_redirects`. Hard limit `maxHops = 5`, default timeout 8s via `AbortSignal.timeout`.

The NSFW blocklist (currently in `fetch-url-meta/blocklist.ts`) stays where it is; `safeFetch` accepts a pluggable `isBlockedHost` callback so `_shared/network.ts` doesn't take a dependency on the blocklist file.

### 2. `_shared/email.ts` — header sanitization

Add `sanitizeHeaderValue(value: string, maxLen = 200): string`:
- Replaces `\r`, `\n`, all `\x00-\x1F` control chars, and `\x7F` with a single space.
- Collapses runs of whitespace.
- Trims.
- Truncates to `maxLen` (default 200).
- Returns the result.

Existing `sendEmail()` API is unchanged. Sanitization is called **explicitly** by each function at the point where the subject is composed — visible in code review, no surprise mutation inside the email helper.

Empty-after-sanitization fallback is the caller's job: `sanitizeHeaderValue(name) || 'Notification from Rat List'`.

### 3. `fetch-url-meta/index.ts` — replace fetch with safeFetch

Current code does roughly:

```typescript
const target = new URL(rawUrl);
if (target.protocol !== 'http:' && target.protocol !== 'https:') return error;
if (isBlockedHost(target.hostname)) return error;
const res = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
```

After:

```typescript
const target = new URL(rawUrl);
try {
  const res = await safeFetch(target, { maxHops: 5, timeoutMs: 8000 }, { isBlockedHost });
  // ... rest of meta extraction unchanged
} catch (err) {
  if (err instanceof BlockedError) return cors.json({ error: err.code }, 422);
  throw err;
}
```

The 2.5 MB response cap (`res.text()` then slice) stays. NSFW response-body keyword check (if any) stays. Only the network-layer logic changes.

### 4. Idempotency migration

`20260517XXXXXX_santa_email_idempotency.sql` (replace `XXXXXX` with the actual UTC time at commit time — convention follows existing migrations like `20260517181620_event_items_visibility.sql`):

```sql
alter table public.santa_events
  add column draw_emailed_at timestamptz,
  add column start_emailed_at timestamptz;

comment on column public.santa_events.draw_emailed_at is
  'Set by send-santa-draw on successful mass-mail. NULL = not yet sent. Used as an atomic claim.';
comment on column public.santa_events.start_emailed_at is
  'Set by send-santa-start on successful mass-mail. NULL = not yet sent. Used as an atomic claim.';
```

No RLS change: organisers already see their own `santa_events` rows. No client-side display surface yet.

### 5. Idempotency in `send-santa-draw` / `send-santa-start`

Pattern (same for both, with `draw_` / `start_` swapped):

```typescript
// 1. Verify caller is the organiser (existing check stays unchanged).

// 2. Atomic claim: UPDATE ... WHERE ... IS NULL returning the row.
const { data: claimed, error: claimErr } = await admin
  .from('santa_events')
  .update({ draw_emailed_at: new Date().toISOString() })
  .eq('id', eventId)
  .is('draw_emailed_at', null)
  .select('id')
  .maybeSingle();

if (claimErr) return cors.json({ error: 'db_error' }, 500);
if (!claimed) return cors.json({ error: 'already_emailed' }, 409);

// 3. Send all emails. Collect failures.
let anyFailed = false;
for (const recipient of recipients) {
  const result = await sendEmail({ ... });
  if (!result.ok) anyFailed = true;
}

// 4. Rollback the claim on any failure so a retry can fire.
if (anyFailed) {
  await admin
    .from('santa_events')
    .update({ draw_emailed_at: null })
    .eq('id', eventId);
  return cors.json({ error: 'partial_failure' }, 500);
}

return cors.json({ ok: true });
```

The atomic-claim pattern relies on Postgres serializing the conditional UPDATE: only one concurrent caller's UPDATE matches the predicate. The other one's `select().maybeSingle()` returns null.

Service-role context is used because RLS on `santa_events` doesn't allow `auth.uid()` to write `draw_emailed_at`. We already use the service-role client in these functions for reading `santa_assignments`, so no privilege escalation.

Add `errors.alreadyEmailed` to `app/src/lib/errors.ts` and i18n. Detection: HTTP status 409 with body `{ error: 'already_emailed' }`. Map both `send-santa-draw` and `send-santa-start` responses through the existing FunctionsError flow.

### 6. Header sanitization wiring

In each of the three `send-*` functions, locate where the subject is composed:

```typescript
const subject = `🎁 ${santaEvent.name} — жеребьёвка прошла`;
```

Replace with:

```typescript
const safeName = sanitizeHeaderValue(santaEvent.name) || 'Secret Santa';
const subject = sanitizeHeaderValue(`🎁 ${safeName} — жеребьёвка прошла`);
```

Outer wrap is defense in depth: if a future fixed-string template later includes another field, the outer sanitize still applies.

## Data flow

1. Client calls `/functions/v1/fetch-url-meta` with a URL.
2. Function parses URL, calls `safeFetch(url, opts, { isBlockedHost })`.
3. `safeFetch` loop: per-hop check protocol → blocklist → `resolvesToPrivate` → fetch with `redirect: 'manual'` → follow Location if 3xx.
4. On block, return 422 with the specific error code. On too many redirects, 422. On success, proceed to existing meta extraction.

For email functions:

1. Client triggers `/functions/v1/send-santa-draw` with event_id.
2. Function verifies caller is organiser (unchanged).
3. Atomic claim on `santa_events.draw_emailed_at`. If null → 409. (this prevents double sending across two parallel callers)
4. Fetch recipients (unchanged).
5. For each, sanitize subject + send.
6. If any failed, roll back the claim and return 500.
7. On full success, return 200. `draw_emailed_at` remains set; future calls return 409.

## Error handling

New error codes returned by edge functions (status 4xx):

| Function | Code | HTTP | Meaning |
|---|---|---|---|
| fetch-url-meta | `unsupported_protocol` | 400 | Non-http(s) scheme (existing) |
| fetch-url-meta | `blocked_host` | 422 | NSFW blocklist match (input or any redirect hop) |
| fetch-url-meta | `private_address` | 422 | Resolved IP is private/loopback/metadata |
| fetch-url-meta | `too_many_redirects` | 422 | > 5 hops |
| send-santa-draw | `already_emailed` | 409 | `draw_emailed_at` already set |
| send-santa-start | `already_emailed` | 409 | `start_emailed_at` already set |
| send-santa-* | `partial_failure` | 500 | Resend rejected at least one recipient; claim rolled back |

Frontend mapping in `app/src/lib/errors.ts`:
- New `AppErrorCode.urlNotAllowed` for the three `fetch-url-meta` 422 codes (one user-visible message: "Не получилось загрузить страницу — ссылка похожа на внутреннюю или взрослый сайт").
- New `AppErrorCode.alreadyEmailed` for `already_emailed`.
- `partial_failure` maps to existing `AppErrorCode.generic` (the toast tells the user to retry; this path is rare).

i18n keys added to both `ru.ts` and `en.ts` under `errors.*`.

## Testing

Targeted Deno tests live next to the code, run via `npm run test:edge` (new script at repo root running `cd supabase/functions && deno test --allow-net --allow-env`).

### `_shared/network.test.ts`

- `isPrivateAddress` returns true for: `127.0.0.1`, `10.0.0.1`, `192.168.1.1`, `172.16.0.1`, `172.31.255.255`, `169.254.169.254`, `0.0.0.0`, `100.64.0.1`, `::1`, `fe80::1`, `fc00::abcd`, `localhost`, `db.local`, `vault.internal`.
- Returns false for: `8.8.8.8`, `1.1.1.1`, `93.184.216.34` (example.com), `2001:4860:4860::8888`, `github.com`.
- `safeFetch` mocked with a stub fetcher (Deno doesn't have a built-in fetch mock; use a parameterized fetch fn injected through opts for tests, real `globalThis.fetch` in prod):
  - chain `clean → 302 → blocked.example` raises `BlockedError('blocked_host')`.
  - chain `clean → 302 → http://127.0.0.1/` raises `BlockedError('private_address')`.
  - chain of 6 redirects raises `BlockedError('too_many_redirects')`.
  - clean response (200) is returned unchanged.
- `resolvesToPrivate` tests are marked `Deno.test.ignore` with a TODO comment — they require live DNS and are intentionally skipped in unit tests; covered by manual verification (below).

### `_shared/email.test.ts`

- `sanitizeHeaderValue('Hello\r\nBcc: evil@x')` → `'Hello Bcc: evil@x'`.
- `sanitizeHeaderValue('a'.repeat(500))` has length 200.
- `sanitizeHeaderValue('\r\n\t')` → `''`.
- `sanitizeHeaderValue('  multi\n\n  space  ')` → `'multi space'`.
- `sanitizeHeaderValue('safe subject')` → `'safe subject'` (passthrough).

### `fetch-url-meta/index.test.ts`

- `isBlockedHost` returns true for `pornhub.com`, `m.pornhub.com`, `something.xxx`; false for `amazon.com`, `github.com`.

### Manual verification (recorded in this spec for re-running)

```sh
# A) Local SSRF — must be blocked
curl -X POST "$SUPA_URL/functions/v1/fetch-url-meta" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"url": "http://127.0.0.1:54422/rest/v1/items"}'
# expect: 422 {"error": "private_address"}

# B) DNS rebinding — must be blocked
curl -X POST "$SUPA_URL/functions/v1/fetch-url-meta" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"url": "http://127-0-0-1.nip.io/"}'
# expect: 422 {"error": "private_address"}

# C) Cloud metadata — must be blocked
curl -X POST "$SUPA_URL/functions/v1/fetch-url-meta" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"url": "http://169.254.169.254/latest/meta-data/"}'
# expect: 422 {"error": "private_address"}

# D) Clean URL — must succeed
curl -X POST "$SUPA_URL/functions/v1/fetch-url-meta" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/"}'
# expect: 200 with og: data

# E) CRLF in event name — Subject must be one line
psql "$DB_URL" -c "update santa_events set name = E'Test\nBcc: evil@x.com' where id = '<organizer-event-id>';"
# trigger send-santa-draw from the app (button on the event detail screen)
# open http://localhost:54424 (Mailpit), inspect raw email
# expect: Subject: 🎁 Test Bcc: evil@x.com — жеребьёвка прошла (one line, no BCC header)

# F) Idempotency — parallel calls
(curl -X POST "$SUPA_URL/functions/v1/send-santa-draw" -H "Authorization: Bearer $JWT" \
   -d '{"event_id":"'$EVENT'"}' &
 curl -X POST "$SUPA_URL/functions/v1/send-santa-draw" -H "Authorization: Bearer $JWT" \
   -d '{"event_id":"'$EVENT'"}' &
 wait)
# expect: exactly one 200, one 409 with {"error":"already_emailed"}
# only one set of emails in Mailpit

# G) Idempotency rollback — partial failure
# (manual: temporarily break the recipient email in DB so Resend rejects it,
#  call send-santa-draw, expect 500 + partial_failure, then verify draw_emailed_at is NULL again.)
```

## Rollout

Strict order; the migration MUST precede the function changes:

1. **Commit 1**: migration + regenerated `app/src/types/database.ts`.
   - `supabase migration up --local`, then regen types.
   - Commit on its own so the schema is in place before functions reference it.
2. **Commit 2**: `_shared/network.ts` + `_shared/email.ts` (new helper) + their tests.
   - No callers yet. Safe.
3. **Commit 3**: `fetch-url-meta/index.ts` rewritten to use `safeFetch`. Its test file.
   - This is the riskiest commit (could over-block legit URLs). Release alone, monitor.
4. **Commit 4**: `send-santa-draw`, `send-santa-start`, `send-group-invite` — sanitize + (first two) idempotency. Add `errors.urlNotAllowed`, `errors.alreadyEmailed` to `errors.ts`, `ru.ts`, `en.ts`.
5. **Commit 5**: `package.json` script `test:edge`. Run it locally as a sanity check.

Then deploy to prod:
- `supabase db push --linked` (apply migration to prod).
- `supabase functions deploy fetch-url-meta send-santa-draw send-santa-start send-group-invite`.

Rollback: every change is additive. If `fetch-url-meta` over-blocks, `git revert` commit 3 and redeploy that function — schema unaffected. The migration's columns are nullable and unused if functions are reverted; we can leave them.

## Risks and mitigations

- **`Deno.resolveDns` not available or behaves unexpectedly on Supabase Edge runtime.** Verify before commit 3 ships: write a one-line smoke function locally (`Deno.resolveDns('example.com', 'A')`) and run it under `supabase functions serve`. If it throws "permission denied" or "not implemented", fall back to `isPrivateAddress` on the literal hostname only (still closes the direct-IP case, leaves DNS-rebinding open) and note the gap in MODERATION.md.
- **Over-blocking legitimate URLs (e.g. an Amazon link that redirects through a CDN whose hostname happens to look like `*.local`).** `BlockedError` is caught and returned as a 422 response — it won't surface in Sentry. To monitor the rollout for a week, add a `console.warn('[fetch-url-meta] blocked', code, hostname)` (no token, no body) inside the catch block; Supabase function logs in the dashboard will show it. Remove the log after one week or once false-positive rate is confirmed near zero. If non-trivial, narrow the blocklist (e.g. only `*.local`, not `*.internal`).
- **Atomic-claim UPDATE failure leaving `draw_emailed_at` set without emails sent.** If the function crashes between the claim UPDATE and the email loop, the event becomes "stuck" — future calls return 409. Mitigation: clear the column manually via psql. (Documented in MODERATION.md as an operator runbook line.) Long-term: a cron that auto-clears claims older than 1 hour with no `draw_completed_at`. Not in scope here.
- **Resend rate limits during a draw with many recipients.** Out of scope — this work doesn't change the email-send pacing.

## Out of scope (recorded so we don't lose them)

- Per-function rate limiting (Phase 2, see PUBLIC_LAUNCH.md).
- CI workflow running `deno test` + `npm run lint` + `npm run build` on PR (Test foundation bucket).
- Resumable per-recipient retry (`emailed_recipients text[]`).
- UI "resend draw emails" button + clear-claim RPC.
- Idempotency on `send-group-invite` (intentionally allowed to resend).
- Logging / observability for blocked SSRF attempts. Sentry already captures uncaught errors; if `BlockedError` rate becomes a tracking concern, add a `console.warn` with the input URL (truncated, no token) — but not in this spec.
