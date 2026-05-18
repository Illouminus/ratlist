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
