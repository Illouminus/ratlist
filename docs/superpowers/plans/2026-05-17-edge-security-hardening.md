# Edge Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two HIGH security findings (SSRF + redirect-bypass in `fetch-url-meta`) and two MED findings (CRLF in email subjects + missing idempotency on bulk Santa emails) surfaced by the 2026-05-17 audit.

**Architecture:** New `_shared/network.ts` module gives every edge function a safe-fetch helper with per-hop blocklist + private-IP + DNS-rebinding checks. Header sanitization helper lands in `_shared/email.ts`. Two new `timestamptz` columns on `santa_events` (`draw_emailed_at`, `start_emailed_at`) act as atomic single-claim flags for the bulk-email functions.

**Tech Stack:** Deno (Supabase Edge Functions), TypeScript strict, Postgres (Supabase), Deno's built-in `Deno.test` test runner.

**Spec:** [`docs/superpowers/specs/2026-05-17-edge-security-hardening-design.md`](../specs/2026-05-17-edge-security-hardening-design.md)

---

## Background notes for the implementer

You may have no context on this repo. Three things to know:

1. **Local Supabase runs on shifted ports 544xx** (54421 API, 54422 DB, 54423 Studio, 54424 Mailpit). The user has another Supabase instance on the default 543xx range — do not stop it.
2. **Conventions are enforced**: `tsconfig.app.json` has `strict: true`, no `any`, no `@ts-ignore`. Every commit message ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` and uses the heredoc form. Conventional-commit style (`feat(...)`, `fix(...)`, `chore(...)`).
3. **The send-santa-draw and send-santa-start functions are fire-and-forget from the client** (`useSantaEvent.runDraw` and `useSantaEvents.createEvent` both `void supabase.functions.invoke(...)` with no UI error surface). A 409 from these does not need user-facing i18n — it dies silently. `fetch-url-meta` errors DO surface (via `fetchUrlMeta.ts`), so `urlNotAllowed` needs i18n.

The local Supabase must be running for tasks 1 and 11:

```sh
supabase start
# in another terminal, when needed:
supabase functions serve --no-verify-jwt
```

---

## Task 1: Migration — `santa_events.draw_emailed_at` and `start_emailed_at`

**Files:**
- Create: `supabase/migrations/20260517193925_santa_email_idempotency.sql`
- Modify (regenerated): `app/src/types/database.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260517193925_santa_email_idempotency.sql
--
-- Idempotency guards for the bulk-email Edge Functions
-- `send-santa-draw` and `send-santa-start`. Set on first successful
-- fan-out, cleared on partial failure so a retry can re-fire. A
-- non-null value means "do not re-send" — the functions use an
-- atomic conditional UPDATE as their claim mechanism.

alter table public.santa_events
  add column draw_emailed_at timestamptz,
  add column start_emailed_at timestamptz;

comment on column public.santa_events.draw_emailed_at is
  'Set by send-santa-draw on successful mass-mail. NULL = not yet sent. Used as an atomic single-claim flag.';
comment on column public.santa_events.start_emailed_at is
  'Set by send-santa-start on successful mass-mail. NULL = not yet sent. Used as an atomic single-claim flag.';
```

- [ ] **Step 2: Apply locally**

Run: `supabase migration up --local`
Expected: `Applying migration 20260517193925_santa_email_idempotency.sql...` followed by no error.

- [ ] **Step 3: Verify the columns exist**

Run:

```sh
psql 'postgresql://postgres:postgres@127.0.0.1:54422/postgres' -c \
  "\d public.santa_events" | grep emailed
```

Expected output includes two lines:
```
 draw_emailed_at  | timestamp with time zone |
 start_emailed_at | timestamp with time zone |
```

- [ ] **Step 4: Regenerate TypeScript types**

Run:
```sh
supabase gen types typescript --local --schema public 2>/dev/null > app/src/types/database.ts
```

- [ ] **Step 5: Verify the regenerated types contain the new columns**

Run: `grep -A 3 "draw_emailed_at" app/src/types/database.ts`
Expected: shows three occurrences (Row, Insert, Update interfaces in santa_events).

- [ ] **Step 6: Commit**

```sh
git add supabase/migrations/20260517193925_santa_email_idempotency.sql app/src/types/database.ts
git commit -m "$(cat <<'EOF'
feat(santa): idempotency columns for bulk-email edge functions

Adds draw_emailed_at and start_emailed_at as atomic single-claim
flags. Functions UPDATE ... WHERE ... IS NULL; the other concurrent
caller gets zero rows back and returns 409.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `_shared/network.ts` — `isPrivateAddress`

**Files:**
- Create: `supabase/functions/_shared/network.ts`
- Create: `supabase/functions/_shared/network.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// supabase/functions/_shared/network.test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { isPrivateAddress } from './network.ts';

Deno.test('isPrivateAddress: loopback IPv4', () => {
  assertEquals(isPrivateAddress('127.0.0.1'), true);
  assertEquals(isPrivateAddress('127.255.255.255'), true);
});

Deno.test('isPrivateAddress: RFC1918 ranges', () => {
  assertEquals(isPrivateAddress('10.0.0.1'), true);
  assertEquals(isPrivateAddress('10.255.255.255'), true);
  assertEquals(isPrivateAddress('192.168.0.1'), true);
  assertEquals(isPrivateAddress('192.168.1.1'), true);
  assertEquals(isPrivateAddress('172.16.0.1'), true);
  assertEquals(isPrivateAddress('172.31.255.255'), true);
});

Deno.test('isPrivateAddress: 172.x boundary cases', () => {
  // Not RFC1918 — 172.15 and 172.32 are public.
  assertEquals(isPrivateAddress('172.15.255.255'), false);
  assertEquals(isPrivateAddress('172.32.0.0'), false);
});

Deno.test('isPrivateAddress: link-local + cloud metadata', () => {
  assertEquals(isPrivateAddress('169.254.169.254'), true);
  assertEquals(isPrivateAddress('169.254.0.1'), true);
});

Deno.test('isPrivateAddress: 0/8 and CGNAT', () => {
  assertEquals(isPrivateAddress('0.0.0.0'), true);
  assertEquals(isPrivateAddress('0.255.255.255'), true);
  assertEquals(isPrivateAddress('100.64.0.1'), true);
  assertEquals(isPrivateAddress('100.127.255.255'), true);
  // outside the 100.64/10 CGNAT range
  assertEquals(isPrivateAddress('100.63.255.255'), false);
  assertEquals(isPrivateAddress('100.128.0.0'), false);
});

Deno.test('isPrivateAddress: IPv6 loopback + link-local + ULA', () => {
  assertEquals(isPrivateAddress('::1'), true);
  assertEquals(isPrivateAddress('fe80::1'), true);
  assertEquals(isPrivateAddress('FE80::1'), true);
  assertEquals(isPrivateAddress('fc00::abcd'), true);
  assertEquals(isPrivateAddress('fd12:3456::1'), true);
});

Deno.test('isPrivateAddress: special hostnames', () => {
  assertEquals(isPrivateAddress('localhost'), true);
  assertEquals(isPrivateAddress('LOCALHOST'), true);
  assertEquals(isPrivateAddress('db.local'), true);
  assertEquals(isPrivateAddress('vault.internal'), true);
  assertEquals(isPrivateAddress('foo.localhost'), true);
});

Deno.test('isPrivateAddress: public addresses pass', () => {
  assertEquals(isPrivateAddress('8.8.8.8'), false);
  assertEquals(isPrivateAddress('1.1.1.1'), false);
  assertEquals(isPrivateAddress('93.184.216.34'), false);
  assertEquals(isPrivateAddress('2001:4860:4860::8888'), false);
  assertEquals(isPrivateAddress('github.com'), false);
  assertEquals(isPrivateAddress('example.com'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd supabase/functions && deno test --allow-net _shared/network.test.ts`
Expected: FAIL with "Module not found: ./network.ts" or "isPrivateAddress is not defined".

- [ ] **Step 3: Write the minimal implementation**

```typescript
// supabase/functions/_shared/network.ts
/**
 * SSRF-aware fetch helpers shared by Edge Functions that pull arbitrary
 * URLs (today only fetch-url-meta, but factored out so og-image and
 * future fetchers can reuse it).
 *
 * The defenses, in order of cheapness:
 *   1. `isPrivateAddress(hostname)` — synchronous string check against
 *      IPv4/IPv6 private/loopback/link-local ranges and special-name
 *      hosts. Catches the direct case `http://127.0.0.1/`.
 *   2. `resolvesToPrivate(hostname)` — async DNS resolution + same
 *      check on every returned IP. Catches DNS rebinding
 *      (`127-0-0-1.nip.io` resolves to 127.0.0.1).
 *   3. `safeFetch(url, opts, hooks)` — manual redirect loop that
 *      reruns 1+2 plus a caller-supplied `isBlockedHost` callback on
 *      EVERY hop. Catches `bit.ly → pornhub.com` redirect bypasses.
 *
 * Errors thrown by safeFetch are `BlockedError`s carrying a stable
 * machine-readable code; the caller maps them to an HTTP response.
 */

const PRIVATE_IPV4_PATTERNS: ReadonlyArray<RegExp> = [
  /^127\./,                                              // loopback
  /^10\./,                                               // RFC1918
  /^192\.168\./,                                         // RFC1918
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,                      // RFC1918 172.16/12
  /^169\.254\./,                                         // link-local + cloud metadata
  /^0\./,                                                // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./,     // 100.64/10 CGNAT
];

const PRIVATE_IPV6_PATTERNS: ReadonlyArray<RegExp> = [
  /^::1$/,           // loopback
  /^fe80:/i,         // link-local
  /^fc/i, /^fd/i,    // ULA (fc00::/7)
];

const PRIVATE_SUFFIXES: ReadonlyArray<string> = [
  '.localhost', '.local', '.internal',
];

export function isPrivateAddress(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost') return true;
  if (PRIVATE_SUFFIXES.some((s) => lower.endsWith(s))) return true;
  if (PRIVATE_IPV4_PATTERNS.some((r) => r.test(lower))) return true;
  if (PRIVATE_IPV6_PATTERNS.some((r) => r.test(lower))) return true;
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd supabase/functions && deno test --allow-net _shared/network.test.ts`
Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```sh
git add supabase/functions/_shared/network.ts supabase/functions/_shared/network.test.ts
git commit -m "$(cat <<'EOF'
feat(edge): isPrivateAddress helper for SSRF defense

Synchronous string check against IPv4/IPv6 private/loopback/link-local
ranges plus special hostnames (localhost, .local, .internal). First
of three layers; resolvesToPrivate and safeFetch follow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `_shared/network.ts` — `resolvesToPrivate`, `BlockedError`, `safeFetch`

**Files:**
- Modify: `supabase/functions/_shared/network.ts`
- Modify: `supabase/functions/_shared/network.test.ts`

- [ ] **Step 1: Add failing tests for BlockedError and safeFetch**

Append to `supabase/functions/_shared/network.test.ts`:

```typescript
import { assertRejects, assertInstanceOf } from 'jsr:@std/assert@1';
import { BlockedError, safeFetch } from './network.ts';

// A tiny in-process fetcher we can inject into safeFetch as a test
// double. Each call returns the response pre-staged for the URL it
// was called with.
function stubFetcher(
  responses: Record<string, { status: number; location?: string; body?: string }>,
): typeof fetch {
  return ((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const r = responses[url];
    if (!r) throw new Error(`stub: no response staged for ${url}`);
    const headers = new Headers();
    if (r.location) headers.set('location', r.location);
    return Promise.resolve(new Response(r.body ?? '', { status: r.status, headers }));
  }) as typeof fetch;
}

Deno.test('safeFetch: clean URL returns the response unchanged', async () => {
  const fetcher = stubFetcher({
    'https://example.com/': { status: 200, body: '<html>ok</html>' },
  });
  const res = await safeFetch(new URL('https://example.com/'), {
    fetcher,
    isBlockedHost: () => false,
    skipDnsCheck: true,
  });
  assertEquals(res.status, 200);
  assertEquals(await res.text(), '<html>ok</html>');
});

Deno.test('safeFetch: rejects redirect to blocked host', async () => {
  const fetcher = stubFetcher({
    'https://clean.example/': { status: 302, location: 'https://blocked.example/x' },
  });
  await assertRejects(
    () => safeFetch(new URL('https://clean.example/'), {
      fetcher,
      isBlockedHost: (h) => h === 'blocked.example',
      skipDnsCheck: true,
    }),
    BlockedError,
    'blocked_host',
  );
});

Deno.test('safeFetch: rejects redirect to private IP', async () => {
  const fetcher = stubFetcher({
    'https://clean.example/': { status: 302, location: 'http://127.0.0.1/' },
  });
  await assertRejects(
    () => safeFetch(new URL('https://clean.example/'), {
      fetcher,
      isBlockedHost: () => false,
      skipDnsCheck: true,
    }),
    BlockedError,
    'private_address',
  );
});

Deno.test('safeFetch: rejects unsupported protocol after redirect', async () => {
  const fetcher = stubFetcher({
    'https://clean.example/': { status: 302, location: 'file:///etc/passwd' },
  });
  await assertRejects(
    () => safeFetch(new URL('https://clean.example/'), {
      fetcher,
      isBlockedHost: () => false,
      skipDnsCheck: true,
    }),
    BlockedError,
    'unsupported_protocol',
  );
});

Deno.test('safeFetch: bails after maxHops redirects', async () => {
  const fetcher = stubFetcher({
    'https://a.example/': { status: 302, location: 'https://b.example/' },
    'https://b.example/': { status: 302, location: 'https://c.example/' },
    'https://c.example/': { status: 302, location: 'https://d.example/' },
    'https://d.example/': { status: 302, location: 'https://e.example/' },
    'https://e.example/': { status: 302, location: 'https://f.example/' },
    'https://f.example/': { status: 302, location: 'https://g.example/' },
  });
  await assertRejects(
    () => safeFetch(new URL('https://a.example/'), {
      fetcher,
      isBlockedHost: () => false,
      maxHops: 5,
      skipDnsCheck: true,
    }),
    BlockedError,
    'too_many_redirects',
  );
});

Deno.test('safeFetch: BlockedError carries a stable code', () => {
  const err = new BlockedError('blocked_host');
  assertInstanceOf(err, Error);
  assertEquals(err.code, 'blocked_host');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd supabase/functions && deno test --allow-net _shared/network.test.ts`
Expected: 6 new failures (BlockedError / safeFetch not exported yet); the 8 isPrivateAddress tests still pass.

- [ ] **Step 3: Append the implementation to `_shared/network.ts`**

Add to `supabase/functions/_shared/network.ts`:

```typescript
export type BlockedCode =
  | 'unsupported_protocol'
  | 'blocked_host'
  | 'private_address'
  | 'too_many_redirects';

export class BlockedError extends Error {
  readonly code: BlockedCode;
  constructor(code: BlockedCode) {
    super(code);
    this.name = 'BlockedError';
    this.code = code;
  }
}

/**
 * Resolve the hostname's A and AAAA records, return true if ANY
 * resolved IP looks private. Catches DNS rebinding: a hostname
 * like `127-0-0-1.nip.io` parses fine but resolves to 127.0.0.1.
 *
 * On NXDOMAIN / DNS failure we return false: the subsequent fetch
 * will surface its own error, and this function isn't here to
 * second-guess the resolver.
 */
export async function resolvesToPrivate(hostname: string): Promise<boolean> {
  const lookups: Promise<string[] | null>[] = [
    Deno.resolveDns(hostname, 'A').catch(() => null),
    Deno.resolveDns(hostname, 'AAAA').catch(() => null),
  ];
  const [a, aaaa] = await Promise.all(lookups);
  const ips = [...(a ?? []), ...(aaaa ?? [])];
  return ips.some((ip) => isPrivateAddress(ip));
}

export interface SafeFetchOptions {
  /** Override the default global fetch (used by tests). */
  fetcher?: typeof fetch;
  /** Maximum redirect hops. Default 5. */
  maxHops?: number;
  /** Timeout in milliseconds. Default 8000. */
  timeoutMs?: number;
  /** Caller-supplied blocklist (e.g. NSFW host check). */
  isBlockedHost: (hostname: string) => boolean;
  /** Skip DNS resolution (only safe in tests). */
  skipDnsCheck?: boolean;
  /** Optional headers forwarded to the underlying fetch. */
  headers?: HeadersInit;
}

/**
 * Manual redirect loop with per-hop blocklist + private-IP checks.
 * Throws BlockedError on any policy violation. Returns the final
 * non-redirect Response.
 */
export async function safeFetch(
  initialUrl: URL,
  opts: SafeFetchOptions,
): Promise<Response> {
  const fetcher = opts.fetcher ?? globalThis.fetch;
  const maxHops = opts.maxHops ?? 5;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const signal = AbortSignal.timeout(timeoutMs);

  let current = initialUrl;
  for (let hop = 0; hop <= maxHops; hop++) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      throw new BlockedError('unsupported_protocol');
    }
    if (opts.isBlockedHost(current.hostname)) {
      throw new BlockedError('blocked_host');
    }
    if (isPrivateAddress(current.hostname)) {
      throw new BlockedError('private_address');
    }
    if (!opts.skipDnsCheck && await resolvesToPrivate(current.hostname)) {
      throw new BlockedError('private_address');
    }

    const res = await fetcher(current, {
      redirect: 'manual',
      signal,
      headers: opts.headers,
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      try {
        current = new URL(loc, current);
      } catch {
        throw new BlockedError('unsupported_protocol');
      }
      continue;
    }
    return res;
  }
  throw new BlockedError('too_many_redirects');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd supabase/functions && deno test --allow-net _shared/network.test.ts`
Expected: all 14 tests pass.

- [ ] **Step 5: Smoke-test `Deno.resolveDns` against the Supabase Edge runtime**

The spec calls for this verification before wiring `safeFetch` into the real `fetch-url-meta`. The risk is that `Deno.resolveDns` may be restricted or unavailable on the hosted Edge runtime.

Create `supabase/functions/_resolve-smoke/index.ts` (temporary file, deleted at the end of this step):

```typescript
import { resolvesToPrivate } from '../_shared/network.ts';

Deno.serve(async () => {
  const a = await resolvesToPrivate('example.com');         // expect false
  const b = await resolvesToPrivate('127-0-0-1.nip.io');    // expect true
  return new Response(JSON.stringify({ example: a, rebind: b }), {
    headers: { 'content-type': 'application/json' },
  });
});
```

Run in a separate terminal (keep it running):
```sh
supabase functions serve --no-verify-jwt
```

Then probe:
```sh
curl -s http://127.0.0.1:54421/functions/v1/_resolve-smoke
```

Expected output: `{"example":false,"rebind":true}`

If you get a permission-denied error or `{"example":false,"rebind":false}`: the runtime cannot resolve DNS. **Stop here, talk to the user.** The fallback path is documented in the spec (skip DNS resolution, ship only the string-check defense, note the gap in MODERATION.md). Do NOT silently downgrade — escalate.

Once verified:
```sh
rm -rf supabase/functions/_resolve-smoke
```

- [ ] **Step 6: Commit**

```sh
git add supabase/functions/_shared/network.ts supabase/functions/_shared/network.test.ts
git commit -m "$(cat <<'EOF'
feat(edge): safeFetch with per-hop blocklist + DNS-rebinding defense

Manual redirect loop that re-runs the caller's NSFW blocklist, the
private-IP check, and a DNS resolve on every hop. Closes redirect-
bypass and DNS-rebinding vectors flagged in the audit. Tests use an
injectable fetcher stub; resolveDns smoke-tested separately against
the Edge runtime.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `_shared/email.ts` — `sanitizeHeaderValue`

**Files:**
- Modify: `supabase/functions/_shared/email.ts`
- Create: `supabase/functions/_shared/email.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// supabase/functions/_shared/email.test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { sanitizeHeaderValue } from './email.ts';

Deno.test('sanitizeHeaderValue: strips CRLF and joins with one space', () => {
  assertEquals(
    sanitizeHeaderValue('Hello\r\nBcc: evil@x.com'),
    'Hello Bcc: evil@x.com',
  );
});

Deno.test('sanitizeHeaderValue: truncates to maxLen', () => {
  const long = 'a'.repeat(500);
  assertEquals(sanitizeHeaderValue(long).length, 200);
});

Deno.test('sanitizeHeaderValue: pure whitespace returns empty', () => {
  assertEquals(sanitizeHeaderValue('\r\n\t'), '');
  assertEquals(sanitizeHeaderValue('   '), '');
});

Deno.test('sanitizeHeaderValue: collapses internal whitespace runs', () => {
  assertEquals(sanitizeHeaderValue('  multi\n\n  space  '), 'multi space');
});

Deno.test('sanitizeHeaderValue: clean value is unchanged', () => {
  assertEquals(sanitizeHeaderValue('safe subject'), 'safe subject');
});

Deno.test('sanitizeHeaderValue: strips control chars below 0x20 and DEL', () => {
  assertEquals(sanitizeHeaderValue('a\x00b\x01c\x1fd\x7fe'), 'a b c d e');
});

Deno.test('sanitizeHeaderValue: maxLen override', () => {
  assertEquals(sanitizeHeaderValue('abcdef', 3), 'abc');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd supabase/functions && deno test _shared/email.test.ts`
Expected: FAIL — `sanitizeHeaderValue` is not exported from `email.ts`.

- [ ] **Step 3: Add the implementation**

Edit `supabase/functions/_shared/email.ts`. After the existing `sendEmail` export, add at the end of the file:

```typescript
/**
 * Sanitize a string before using it as the value of an email header
 * (Subject, From-display, Reply-To-display). Removes CR/LF and other
 * control characters that could be exploited for SMTP header
 * injection (e.g. "Subject\r\nBcc: attacker@x"), collapses
 * whitespace, trims, and caps the length to keep clients happy.
 *
 * Resend may already do its own sanitization, but defense in depth
 * is cheap: do it at the source.
 */
export function sanitizeHeaderValue(value: string, maxLen = 200): string {
  return value
    .replace(/[\r\n\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd supabase/functions && deno test _shared/email.test.ts`
Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```sh
git add supabase/functions/_shared/email.ts supabase/functions/_shared/email.test.ts
git commit -m "$(cat <<'EOF'
feat(edge): sanitizeHeaderValue for email header injection defense

Strips CR/LF and other control characters from user-controlled
strings (event names, group names, organizer display names) before
they land in Subject lines. Defense in depth against SMTP-style
header injection.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `fetch-url-meta` — replace fetch with `safeFetch`

**Files:**
- Modify: `supabase/functions/fetch-url-meta/index.ts`
- Create: `supabase/functions/fetch-url-meta/index.test.ts`

- [ ] **Step 1: Write the failing test (blocklist coverage)**

```typescript
// supabase/functions/fetch-url-meta/index.test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { isBlockedHost } from './blocklist.ts';

Deno.test('blocklist: NSFW host exact match', () => {
  assertEquals(isBlockedHost('pornhub.com'), true);
});

Deno.test('blocklist: NSFW host subdomain', () => {
  assertEquals(isBlockedHost('m.pornhub.com'), true);
  assertEquals(isBlockedHost('cdn.pornhub.com'), true);
});

Deno.test('blocklist: NSFW TLD', () => {
  assertEquals(isBlockedHost('something.xxx'), true);
  assertEquals(isBlockedHost('a.b.adult'), true);
});

Deno.test('blocklist: clean hosts pass', () => {
  assertEquals(isBlockedHost('amazon.com'), false);
  assertEquals(isBlockedHost('github.com'), false);
  assertEquals(isBlockedHost('not-pornhub.com'), false);
});
```

- [ ] **Step 2: Run test to verify it passes (already)**

Run: `cd supabase/functions && deno test fetch-url-meta/index.test.ts`
Expected: all 4 tests pass — `isBlockedHost` already exists and behaves correctly. This is a pure characterization test that locks the current behavior before refactoring; not a TDD-driven failure.

(If you want to see it fail, temporarily edit `blocklist.ts` to remove `'pornhub.com'`, watch the test fail, then put it back.)

- [ ] **Step 3: Update `fetch-url-meta/index.ts` to use `safeFetch`**

Replace the existing `parseMetadata` function and the handler's pre-fetch validation. The diff lands in two places.

**3a.** Update imports at the top of `supabase/functions/fetch-url-meta/index.ts`:

```typescript
import { bindCors } from '../_shared/cors.ts';
import { isBlockedHost } from './blocklist.ts';
import { BlockedError, safeFetch } from '../_shared/network.ts';
```

**3b.** Replace the `parseMetadata` function body. The current body has its own `AbortController` + `fetch`. Replace from:

```typescript
async function parseMetadata(url: string): Promise<UrlMetadata> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  ...
}
```

To:

```typescript
async function parseMetadata(url: string): Promise<UrlMetadata> {
  const response = await safeFetch(new URL(url), {
    isBlockedHost,
    maxHops: 5,
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) throw new Error(`http_${response.status}`);
  // Cap the body so a runaway 50 MB page can't OOM the function.
  const html = (await response.text()).slice(0, 2_500_000);

  let result: UrlMetadata = {};
  result = mergePrefer(result, extractOpenGraph(html));
  result = mergePrefer(result, extractJsonLdProduct(html));
  result = mergePrefer(result, extractAmazon(html));
  result = mergePrefer(result, extractFallbacks(html, url));

  if (result.image_url) {
    result.image_url = absolutise(result.image_url, url);
  }
  return result;
}
```

**3c.** Remove the upfront `isBlockedHost(target.hostname)` check and the `protocol` check inside `Deno.serve`; `safeFetch` now does them at the first hop. The handler block becomes:

```typescript
Deno.serve(async (req) => {
  const cors = bindCors(req);
  if (req.method === 'OPTIONS') return cors.preflight();
  if (req.method !== 'POST') {
    return cors.json({ error: 'method_not_allowed' }, 405);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return cors.json({ error: 'invalid_json' }, 400);
  }

  if (typeof body.url !== 'string' || body.url.trim().length === 0) {
    return cors.json({ error: 'url_required' }, 400);
  }

  let target: URL;
  try {
    target = new URL(body.url.trim());
  } catch {
    return cors.json({ error: 'invalid_url' }, 400);
  }

  try {
    const metadata = await parseMetadata(target.toString());
    return cors.json(metadata, 200);
  } catch (err) {
    if (err instanceof BlockedError) {
      // Log enough to monitor false-positive rate during rollout. The
      // hostname is the user's input — already public-facing on the
      // wishlist; no token leakage. Remove this console.warn after
      // one week of low false-positive rate.
      console.warn('[fetch-url-meta] blocked', err.code, target.hostname);
      // 400 for unsupported_protocol (malformed request), 422 for the
      // policy refusals (we understood, we won't fetch this).
      const status = err.code === 'unsupported_protocol' ? 400 : 422;
      return cors.json({ error: err.code }, status);
    }
    const message =
      err instanceof Error && err.name === 'TimeoutError'
        ? 'timeout'
        : err instanceof Error
          ? err.message
          : 'unknown_error';
    return cors.json({ error: 'fetch_failed', detail: message }, 502);
  }
});
```

Note: the `TimeoutError` rename is because `AbortSignal.timeout()` throws `TimeoutError`, not the old `AbortError` from a manually-aborted `AbortController`.

- [ ] **Step 4: Re-run the blocklist test to confirm the refactor didn't break the import path**

Run: `cd supabase/functions && deno test fetch-url-meta/index.test.ts`
Expected: still passes.

- [ ] **Step 5: Type-check the whole edge-function tree**

Run: `cd supabase/functions && deno check fetch-url-meta/index.ts _shared/network.ts _shared/email.ts`
Expected: no errors.

- [ ] **Step 6: Smoke-test against local Supabase**

Make sure `supabase functions serve --no-verify-jwt` is running.

```sh
# A. Direct private IP — must be 422 private_address
curl -s -X POST http://127.0.0.1:54421/functions/v1/fetch-url-meta \
  -H "Content-Type: application/json" \
  -d '{"url": "http://127.0.0.1:54422/rest/v1/"}'

# Expected: {"error":"private_address"}  (HTTP 422)

# B. DNS rebinding — must be 422 private_address
curl -s -X POST http://127.0.0.1:54421/functions/v1/fetch-url-meta \
  -H "Content-Type: application/json" \
  -d '{"url": "http://127-0-0-1.nip.io/"}'

# Expected: {"error":"private_address"}  (HTTP 422)

# C. Cloud metadata — must be 422 private_address
curl -s -X POST http://127.0.0.1:54421/functions/v1/fetch-url-meta \
  -H "Content-Type: application/json" \
  -d '{"url": "http://169.254.169.254/latest/meta-data/"}'

# Expected: {"error":"private_address"}  (HTTP 422)

# D. Clean URL — must succeed
curl -s -X POST http://127.0.0.1:54421/functions/v1/fetch-url-meta \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/"}'

# Expected: 200 with at least {"title":"Example Domain", ...}

# E. NSFW host — must be 422 blocked_host
curl -s -X POST http://127.0.0.1:54421/functions/v1/fetch-url-meta \
  -H "Content-Type: application/json" \
  -d '{"url": "https://pornhub.com/"}'

# Expected: {"error":"blocked_host"}  (HTTP 422)
```

If any expected check fails — do not proceed. Re-read the diff, fix, re-test.

- [ ] **Step 7: Commit**

```sh
git add supabase/functions/fetch-url-meta/index.ts supabase/functions/fetch-url-meta/index.test.ts
git commit -m "$(cat <<'EOF'
feat(edge): SSRF-safe fetch in fetch-url-meta

Replaces the direct fetch() with safeFetch from _shared/network.ts.
Blocks private/loopback/metadata IPs (incl. DNS rebinding) and
re-checks the NSFW blocklist on every redirect hop. Closes the two
HIGH findings from the 2026-05-17 audit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `send-santa-draw` — sanitize subject + idempotency claim

**Files:**
- Modify: `supabase/functions/send-santa-draw/index.ts`

- [ ] **Step 1: Add imports and atomic-claim helper at the top of the function body**

Edit `supabase/functions/send-santa-draw/index.ts`.

**1a.** Update imports:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { bindCors } from '../_shared/cors.ts';
import { sendEmail, sanitizeHeaderValue } from '../_shared/email.ts';
import { renderSantaDrawEmail, renderSantaDrawText } from './template.ts';
```

**1b.** Update the `SantaEvent` interface to include the new column (so TS knows about it):

```typescript
interface SantaEvent {
  id: string;
  name: string;
  status: string;
  created_by: string;
  draw_emailed_at: string | null;
}
```

**1c.** Update the select that loads the event:

Find:
```typescript
  const { data: event, error: eventErr } = await admin
    .from('santa_events')
    .select('id, name, status, created_by')
    .eq('id', eventId)
    .maybeSingle();
```

Replace with:
```typescript
  const { data: event, error: eventErr } = await admin
    .from('santa_events')
    .select('id, name, status, created_by, draw_emailed_at')
    .eq('id', eventId)
    .maybeSingle();
```

- [ ] **Step 2: Add the idempotency claim immediately after the `wrong_status` check**

Find the `if (santaEvent.status !== 'drawn') { ... }` block. AFTER it, INSERT the following block. This must come BEFORE the "Get the organiser's display name" section (claim happens early so we don't waste DB work on a duplicate call):

```typescript
  // Atomic single-claim: only one concurrent caller's UPDATE matches
  // the predicate. The other gets zero rows back and bails with 409.
  const { data: claimed, error: claimErr } = await admin
    .from('santa_events')
    .update({ draw_emailed_at: new Date().toISOString() })
    .eq('id', eventId)
    .is('draw_emailed_at', null)
    .select('id')
    .maybeSingle();
  if (claimErr) {
    return cors.json({ error: 'db_error', detail: claimErr.message }, 500);
  }
  if (!claimed) {
    return cors.json({ error: 'already_emailed' }, 409);
  }
```

- [ ] **Step 3: Sanitize the subject**

Find:
```typescript
  const subject = `🎁 ${santaEvent.name} — the draw is done`;
```

Replace with:
```typescript
  const safeEventName = sanitizeHeaderValue(santaEvent.name) || 'Secret Santa';
  const subject = sanitizeHeaderValue(`🎁 ${safeEventName} — the draw is done`);
```

- [ ] **Step 4: Roll back the claim on partial failure**

Find the end of the handler:
```typescript
  const settled = await Promise.allSettled(sendOps);
  let sent = 0;
  let failed = 0;
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value.ok) sent++;
    else failed++;
  }

  return cors.json({ ok: true, sent, failed, total: assignments.length });
});
```

Replace with:
```typescript
  const settled = await Promise.allSettled(sendOps);
  let sent = 0;
  let failed = 0;
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value.ok) sent++;
    else failed++;
  }

  // If every send failed, the claim is the only side-effect — roll it
  // back so a retry can re-fire. A partial success keeps the claim
  // (some givers already got their email; we don't want to spam them
  // a second time).
  if (sent === 0 && failed > 0) {
    await admin
      .from('santa_events')
      .update({ draw_emailed_at: null })
      .eq('id', eventId);
  }

  return cors.json({ ok: true, sent, failed, total: assignments.length });
});
```

- [ ] **Step 5: Type-check**

Run: `cd supabase/functions && deno check send-santa-draw/index.ts`
Expected: no errors.

- [ ] **Step 6: Manual verification — idempotent on second call**

Make sure local Supabase + functions serve are running. Find a Santa event in `drawn` status (or create one via the app + `run_santa_draw`). Then:

```sh
# First call: claims, sends (dry-run since RESEND_API_KEY is empty in local), returns ok
# Second call (same event_id): must return 409 already_emailed.
EVENT='<paste-event-id>'
JWT='<paste-organizer-jwt-from-browser-devtools>'

curl -s -X POST http://127.0.0.1:54421/functions/v1/send-santa-draw \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"event_id\":\"$EVENT\"}"
# Expected: {"ok":true,"sent":N,"failed":0,"total":N}

curl -s -X POST http://127.0.0.1:54421/functions/v1/send-santa-draw \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"event_id\":\"$EVENT\"}"
# Expected: {"error":"already_emailed"}  (HTTP 409)
```

If you need to reset for further testing:
```sh
psql 'postgresql://postgres:postgres@127.0.0.1:54422/postgres' \
  -c "update public.santa_events set draw_emailed_at = null where id = '$EVENT';"
```

- [ ] **Step 7: Manual verification — CRLF stripped from subject**

Inject a newline into the event name and look at the dry-run output:

```sh
psql 'postgresql://postgres:postgres@127.0.0.1:54422/postgres' \
  -c "update public.santa_events set name = E'Test\nBcc: evil@x.com', draw_emailed_at = null where id = '$EVENT';"

curl -s -X POST http://127.0.0.1:54421/functions/v1/send-santa-draw \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"event_id\":\"$EVENT\"}"

# Watch the `supabase functions serve` terminal output. You should see
# a line like:
#   [email:dry-run] {"to":"...","subject":"🎁 Test Bcc: evil@x.com — the draw is done","htmlBytes":...}
# One line, no real newline in the subject.
```

- [ ] **Step 8: Commit**

```sh
git add supabase/functions/send-santa-draw/index.ts
git commit -m "$(cat <<'EOF'
feat(edge): sanitize subject + idempotency in send-santa-draw

Wraps the Subject through sanitizeHeaderValue (defense against
CRLF/header injection via event name). Adds an atomic claim on
santa_events.draw_emailed_at: concurrent callers get 409
already_emailed; full-failure runs roll the claim back.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `send-santa-start` — sanitize subject + idempotency claim

**Files:**
- Modify: `supabase/functions/send-santa-start/index.ts`

Same pattern as Task 6, applied to `start_emailed_at`.

- [ ] **Step 1: Update imports**

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { bindCors } from '../_shared/cors.ts';
import { sendEmail, sanitizeHeaderValue } from '../_shared/email.ts';
import { renderSantaStartEmail, renderSantaStartText } from './template.ts';
```

- [ ] **Step 2: Update `SantaEventWithGroup` interface**

Add `start_emailed_at: string | null;`:

```typescript
interface SantaEventWithGroup {
  id: string;
  name: string;
  status: string;
  created_by: string;
  group_id: string;
  draw_deadline: string | null;
  start_emailed_at: string | null;
  groups: { name: string } | null;
}
```

- [ ] **Step 3: Update the event select**

Find:
```typescript
  const { data: event, error: eventErr } = await admin
    .from('santa_events')
    .select('id, name, status, created_by, group_id, draw_deadline, groups(name)')
    .eq('id', eventId)
    .maybeSingle();
```

Replace with:
```typescript
  const { data: event, error: eventErr } = await admin
    .from('santa_events')
    .select('id, name, status, created_by, group_id, draw_deadline, start_emailed_at, groups(name)')
    .eq('id', eventId)
    .maybeSingle();
```

- [ ] **Step 4: Add the idempotency claim after the `wrong_status` check**

Find the `if (santaEvent.status !== 'collecting') { ... }` block. AFTER it, INSERT:

```typescript
  // Atomic single-claim. See send-santa-draw for the rationale.
  const { data: claimed, error: claimErr } = await admin
    .from('santa_events')
    .update({ start_emailed_at: new Date().toISOString() })
    .eq('id', eventId)
    .is('start_emailed_at', null)
    .select('id')
    .maybeSingle();
  if (claimErr) {
    return cors.json({ error: 'db_error', detail: claimErr.message }, 500);
  }
  if (!claimed) {
    return cors.json({ error: 'already_emailed' }, 409);
  }
```

- [ ] **Step 5: Sanitize the subject**

Find:
```typescript
  const subject = `🎄 ${organizerName} started a Secret Santa — ${santaEvent.name}`;
```

Replace with:
```typescript
  const safeOrganizer = sanitizeHeaderValue(organizerName) || 'A fellow rat';
  const safeEventName = sanitizeHeaderValue(santaEvent.name) || 'Secret Santa';
  const subject = sanitizeHeaderValue(
    `🎄 ${safeOrganizer} started a Secret Santa — ${safeEventName}`,
  );
```

- [ ] **Step 6: Roll back claim on full failure**

Find:
```typescript
  const settled = await Promise.allSettled(sendOps);
  let sent = 0;
  let failed = 0;
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value.ok) sent++;
    else failed++;
  }

  return cors.json({ ok: true, sent, failed, total: members.length });
});
```

Replace with:
```typescript
  const settled = await Promise.allSettled(sendOps);
  let sent = 0;
  let failed = 0;
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value.ok) sent++;
    else failed++;
  }

  if (sent === 0 && failed > 0) {
    await admin
      .from('santa_events')
      .update({ start_emailed_at: null })
      .eq('id', eventId);
  }

  return cors.json({ ok: true, sent, failed, total: members.length });
});
```

- [ ] **Step 7: Type-check**

Run: `cd supabase/functions && deno check send-santa-start/index.ts`
Expected: no errors.

- [ ] **Step 8: Manual verification — same pattern as Task 6**

Find a `collecting`-status Santa event with at least one other group member, then run two parallel curls:

```sh
EVENT='<paste-event-id>'
JWT='<organizer-jwt>'

(curl -s -X POST http://127.0.0.1:54421/functions/v1/send-santa-start \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d "{\"event_id\":\"$EVENT\"}" &
 curl -s -X POST http://127.0.0.1:54421/functions/v1/send-santa-start \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d "{\"event_id\":\"$EVENT\"}" &
 wait)
```

Expected: one response `{"ok":true,...}`, one `{"error":"already_emailed"}` (HTTP 409). Order is non-deterministic.

To reset:
```sh
psql 'postgresql://postgres:postgres@127.0.0.1:54422/postgres' \
  -c "update public.santa_events set start_emailed_at = null where id = '$EVENT';"
```

- [ ] **Step 9: Commit**

```sh
git add supabase/functions/send-santa-start/index.ts
git commit -m "$(cat <<'EOF'
feat(edge): sanitize subject + idempotency in send-santa-start

Same pattern as send-santa-draw, applied to start_emailed_at. The
organizer-display-name and event-name both flow into the Subject, so
both pass through sanitizeHeaderValue.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `send-group-invite` — sanitize subject only

**Files:**
- Modify: `supabase/functions/send-group-invite/index.ts`

No idempotency: the function is intentionally re-sendable (user asks "the recipient didn't get it, send again"). Only sanitize.

- [ ] **Step 1: Update imports**

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { bindCors } from '../_shared/cors.ts';
import { sendEmail, sanitizeHeaderValue } from '../_shared/email.ts';
import { renderGroupInviteEmail, renderGroupInviteText } from './template.ts';
```

- [ ] **Step 2: Sanitize the subject**

Find:
```typescript
  const subject = `${organizerName} invites you to «${group.name}» on Rat List`;
```

Replace with:
```typescript
  const safeOrganizer = sanitizeHeaderValue(organizerName) || 'A fellow rat';
  const safeGroupName = sanitizeHeaderValue(group.name) || 'the group';
  const subject = sanitizeHeaderValue(
    `${safeOrganizer} invites you to «${safeGroupName}» on Rat List`,
  );
```

- [ ] **Step 3: Type-check**

Run: `cd supabase/functions && deno check send-group-invite/index.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```sh
git add supabase/functions/send-group-invite/index.ts
git commit -m "$(cat <<'EOF'
feat(edge): sanitize subject in send-group-invite

Group name and inviter display name both reach the Subject line.
Wrap both fields plus the final composed string through
sanitizeHeaderValue. No idempotency change — resending the same
invite to the same recipient is an intentional UX affordance.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Frontend — `urlNotAllowed` error code + i18n

**Files:**
- Modify: `app/src/lib/errors.ts`
- Modify: `app/src/i18n/ru.ts`
- Modify: `app/src/i18n/en.ts`

Background: `fetchUrlMeta.ts` returns `{ kind: 'error', code }` where `code` is the raw `error` field from the function response. The three new SSRF codes plus the existing `blocked_host` all mean "we won't fetch this URL — show a single friendly message". Map all four to a new `urlNotAllowed` AppErrorCode. (No `alreadyEmailed` mapping needed — `send-santa-draw` and `send-santa-start` are fire-and-forget; the client never inspects their response.)

- [ ] **Step 1: Add `urlNotAllowed` to the `AppErrorCode` union**

Edit `app/src/lib/errors.ts`. Find:
```typescript
  // storage / photos
  | 'photoTooLarge'
  | 'photoBadType';
```

Replace with:
```typescript
  // storage / photos
  | 'photoTooLarge'
  | 'photoBadType'
  // edge-function policy refusals (fetch-url-meta)
  | 'urlNotAllowed';
```

- [ ] **Step 2: Add message-fragment matchers in `matchMessage()`**

Edit `app/src/lib/errors.ts`. Find:
```typescript
  // Storage / upload errors from our own utility
  if (m.includes('file_too_large')) return 'photoTooLarge';
  if (m.includes('unsupported_type')) return 'photoBadType';
```

INSERT BEFORE those lines (alphabetical-ish order, doesn't matter much; order-of-matchers comment in the file says "more specific first"):

```typescript
  // fetch-url-meta policy refusals (HTTP 422)
  if (
    m.includes('blocked_host') ||
    m.includes('private_address') ||
    m.includes('too_many_redirects') ||
    m.includes('unsupported_protocol')
  ) {
    return 'urlNotAllowed';
  }

```

- [ ] **Step 3: Add the RU string**

Edit `app/src/i18n/ru.ts`. Find:
```typescript
    photoTooLarge: 'картинка слишком тяжёлая — максимум 8 МБ.',
    photoBadType: 'нужен png, jpg или webp.',
  },
```

Replace with:
```typescript
    photoTooLarge: 'картинка слишком тяжёлая — максимум 8 МБ.',
    photoBadType: 'нужен png, jpg или webp.',

    urlNotAllowed: 'не получилось загрузить страницу — ссылка похожа на внутреннюю или взрослый сайт.',
  },
```

- [ ] **Step 4: Add the EN string**

Edit `app/src/i18n/en.ts`. Find the `errors:` block (starts at line ~550). Find the equivalent `photoTooLarge`/`photoBadType` pair and add `urlNotAllowed` with the EN string immediately after them, mirroring the RU placement:

```typescript
    photoTooLarge: 'image too heavy — max 8 MB.',
    photoBadType: 'needs to be png, jpg, or webp.',

    urlNotAllowed: "couldn't load that link — it looks like an internal address or an adult site.",
  },
```

(Replace the exact `photoTooLarge` / `photoBadType` strings only if they already exist verbatim. The exact wording isn't critical — match the conversational register of the surrounding strings.)

- [ ] **Step 5: Type-check the app**

Run: `cd app && npx tsc -b --noEmit`
Expected: no errors. The EN dict's `Translation` shape comes from `ru.ts`, so a missing key in EN would fail here.

- [ ] **Step 6: Lint**

Run: `cd app && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```sh
git add app/src/lib/errors.ts app/src/i18n/ru.ts app/src/i18n/en.ts
git commit -m "$(cat <<'EOF'
feat(errors): urlNotAllowed code for fetch-url-meta policy refusals

Maps the four edge-function refusal codes (blocked_host,
private_address, too_many_redirects, unsupported_protocol) into a
single user-facing string. The user shouldn't care which specific
defense fired — only that we won't fetch this URL.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `npm run test:edge` script

**Files:**
- Modify: `app/package.json` (the root scripts are inside `app/`, not at repo root — verify before editing; if there's a top-level `package.json`, put it there instead)

- [ ] **Step 1: Locate the right `package.json`**

Run: `ls /Users/edouard/dev/wishlist/package.json /Users/edouard/dev/wishlist/app/package.json 2>&1`
Expected: one of them exists. The conventional place for this in this repo is `app/package.json` (this is where `dev`/`build`/`lint` live).

- [ ] **Step 2: Add the script**

Edit `app/package.json`. Find the `"scripts"` object (e.g. `"dev"`, `"build"`, `"lint"`, `"preview"`). Add one new entry:

```json
"test:edge": "cd ../supabase/functions && deno test --allow-net --allow-env"
```

The relative path goes from `app/` up to `supabase/functions/`.

- [ ] **Step 3: Run the script**

Run: `cd app && npm run test:edge`
Expected: 4 test files run (`_shared/network.test.ts`, `_shared/email.test.ts`, `fetch-url-meta/index.test.ts`, and any others added). All tests pass. Total runtime under 5 seconds.

If `deno` is not installed: `brew install deno`.

- [ ] **Step 4: Commit**

```sh
git add app/package.json
git commit -m "$(cat <<'EOF'
chore(edge): npm run test:edge script

One entry point for the new Deno-based edge function tests. Not
wired into CI yet (CI is in the Test foundation bucket); running
locally is enough for the next deploy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Final verification & deploy checklist

This task does not produce a commit. It's the gate before pushing.

- [ ] **Step 1: Re-run the full edge test suite**

Run: `cd app && npm run test:edge`
Expected: every test passes.

- [ ] **Step 2: Re-run the full frontend typecheck + lint + build**

Run: `cd app && npm run build`
Expected: tsc + vite build complete with no errors.

- [ ] **Step 3: Manually re-walk the verification matrix from the spec**

With local Supabase + functions serve running, run all checks from Task 5 Step 6 and Task 6 Steps 6–7 plus Task 7 Step 8. Each must return the expected response.

Checklist (write the response into this comment block to confirm — actual response in parentheses):

```
- fetch-url-meta:
  - 127.0.0.1:54422            → 422 private_address           (   )
  - 127-0-0-1.nip.io           → 422 private_address           (   )
  - 169.254.169.254            → 422 private_address           (   )
  - https://example.com/       → 200 with og metadata          (   )
  - https://pornhub.com/       → 422 blocked_host              (   )

- send-santa-draw:
  - first call                 → 200 ok                        (   )
  - second call (same event)   → 409 already_emailed           (   )
  - event with CRLF in name    → dry-run subject is one line   (   )

- send-santa-start:
  - parallel double-fire       → exactly one 200, one 409      (   )
```

- [ ] **Step 4: Deploy to production**

The user has previously deployed via `supabase db push --linked` and `supabase functions deploy`. **Do not push without asking the user.** When the user authorises:

```sh
# Apply the migration to prod Supabase
supabase db push --linked

# Deploy the four touched functions
supabase functions deploy fetch-url-meta send-santa-draw send-santa-start send-group-invite
```

`og-image` is not touched in this work and does not need redeployment. `_shared/network.ts` and `_shared/email.ts` ride along with each function's deploy automatically (they're bundled).

- [ ] **Step 5: Post-deploy smoke**

After deploy, run the fetch-url-meta verification matrix from Task 5 Step 6 again against the prod URL (replace `127.0.0.1:54421` with `https://your-supabase-project.supabase.co`). At minimum:

```sh
curl -s -X POST https://<project>.supabase.co/functions/v1/fetch-url-meta \
  -H "apikey: $PROD_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/"}'
# Expected: 200 with og metadata

curl -s -X POST https://<project>.supabase.co/functions/v1/fetch-url-meta \
  -H "apikey: $PROD_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"url": "http://169.254.169.254/"}'
# Expected: 422 private_address
```

- [ ] **Step 6: Monitor logs for one week**

The Supabase dashboard's function-logs view will show `console.warn('[fetch-url-meta] blocked', code, hostname)` for every refusal. Check daily for false-positive patterns. After one week of low-FP signal, open a follow-up commit removing the `console.warn` line.

Set a calendar reminder for **2026-05-24** to review and clean up.

---

## What this plan does NOT do (deferred to other buckets)

- CI: no `.github/workflows` added. `npm run test:edge` exists but isn't gated on PRs.
- Generic edge-function rate-limiting (Phase 2).
- A UI "resend draw emails" button + clear-claim RPC. If users ask for it, add `clear_email_claim(event_id, kind)` RPC and a button on the Santa event detail screen.
- Resumable per-recipient retry. We accept that on partial failure (sent==0) we roll back; on partial-success we don't, so a manual retry-after-fix would re-email earlier successes. Documented in the spec.
- Removing the temporary `console.warn` in `fetch-url-meta` (do this 2026-05-24).
