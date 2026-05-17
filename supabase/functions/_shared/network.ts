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
