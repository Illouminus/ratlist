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
