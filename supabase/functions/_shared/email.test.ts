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
