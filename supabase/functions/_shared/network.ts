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
