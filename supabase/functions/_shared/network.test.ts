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
      isBlockedHost: (h: string) => h === 'blocked.example',
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
