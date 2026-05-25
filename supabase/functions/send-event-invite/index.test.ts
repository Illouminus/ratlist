import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { renderHtml, renderText, type EventInviteVars } from './template.ts';

Deno.test('renderHtml includes inviter, title, url, and localised date when provided', () => {
  const vars: EventInviteVars = {
    inviterName: 'Саша',
    recipientName: 'Оля',
    eventTitle: 'День рождения',
    eventOccursOn: '2026-06-12',
    eventUrl: 'https://ratlist.app/event/abc123def456',
  };
  const html = renderHtml(vars);
  assertStringIncludes(html, 'Саша');
  assertStringIncludes(html, 'День рождения');
  assertStringIncludes(html, 'https://ratlist.app/event/abc123def456');
  assertStringIncludes(html, 'июня');
});

Deno.test('renderHtml omits date line when null', () => {
  const html = renderHtml({
    inviterName: 'Саша',
    recipientName: 'Оля',
    eventTitle: 'X',
    eventOccursOn: null,
    eventUrl: 'https://x/',
  });
  const hasMonthName = /январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр/.test(html);
  assertEquals(hasMonthName, false);
});

Deno.test('renderHtml escapes HTML in user-controlled fields', () => {
  const html = renderHtml({
    inviterName: '<script>alert(1)</script>',
    recipientName: 'x',
    eventTitle: '"evil"',
    eventOccursOn: null,
    eventUrl: 'https://x/',
  });
  assertEquals(/<script>/.test(html), false);
  assertEquals(html.includes('&lt;script&gt;'), true);
  assertEquals(html.includes('&quot;evil&quot;'), true);
});

Deno.test('renderHtml escapes attribute injection in eventUrl', () => {
  const html = renderHtml({
    inviterName: 'a',
    recipientName: 'b',
    eventTitle: 'c',
    eventOccursOn: null,
    eventUrl: 'https://x/"><script>bad()</script>',
  });
  // Closing the href attribute must not succeed.
  assertEquals(html.includes('"><script>'), false);
});

Deno.test('renderText includes inviter, title, url', () => {
  const text = renderText({
    inviterName: 'Саша',
    recipientName: 'Оля',
    eventTitle: 'TestTitle',
    eventOccursOn: null,
    eventUrl: 'https://ratlist.app/event/xyz',
  });
  assertStringIncludes(text, 'Саша');
  assertStringIncludes(text, 'TestTitle');
  assertStringIncludes(text, 'https://ratlist.app/event/xyz');
});

Deno.test('renderText includes localised date when provided', () => {
  const text = renderText({
    inviterName: 'a',
    recipientName: 'b',
    eventTitle: 'c',
    eventOccursOn: '2026-06-12',
    eventUrl: 'https://x/',
  });
  assertStringIncludes(text, 'июня');
});
