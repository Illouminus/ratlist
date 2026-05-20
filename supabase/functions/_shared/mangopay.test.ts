import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { verifyWebhookSignature } from './mangopay.ts';

Deno.test('verifyWebhookSignature accepts matching signature', async () => {
  const body = '{"event":"PAYIN_NORMAL_SUCCEEDED"}';
  const secret = 'test-secret';
  // Compute the expected signature via Web Crypto so the test is self-contained.
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  assertEquals(await verifyWebhookSignature(body, hex, secret), true);
});

Deno.test('verifyWebhookSignature rejects tampered signature', async () => {
  const body = '{"event":"PAYIN_NORMAL_SUCCEEDED"}';
  const secret = 'test-secret';
  assertEquals(
    await verifyWebhookSignature(body, 'a'.repeat(64), secret),
    false,
  );
});

Deno.test('verifyWebhookSignature rejects body modification', async () => {
  const secret = 'test-secret';
  const realBody = '{"event":"PAYIN_NORMAL_SUCCEEDED","resourceId":"123"}';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(realBody));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // A different body with the same signature must fail.
  const tamperedBody = '{"event":"PAYIN_NORMAL_SUCCEEDED","resourceId":"456"}';
  assertEquals(await verifyWebhookSignature(tamperedBody, hex, secret), false);
});

Deno.test('verifyWebhookSignature rejects empty signature or secret', async () => {
  assertEquals(await verifyWebhookSignature('body', '', 'secret'), false);
  assertEquals(await verifyWebhookSignature('body', 'sig', ''), false);
});
