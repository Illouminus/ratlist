import { assertEquals, assertMatch } from 'jsr:@std/assert';
import { renderFriendInviteEmail, renderFriendInviteText } from './template.ts';

Deno.test('renderFriendInviteEmail includes sender + invite URL + message', () => {
  const html = renderFriendInviteEmail({
    senderName: 'Эдуард',
    inviteUrl: 'https://ratlist.app/friend-invite/abc123',
    message: 'Аня, добавляйся',
  });
  assertMatch(html, /Эдуард/);
  assertMatch(html, /https:\/\/ratlist\.app\/friend-invite\/abc123/);
  assertMatch(html, /Аня, добавляйся/);
});

Deno.test('renderFriendInviteEmail handles null message', () => {
  const html = renderFriendInviteEmail({
    senderName: 'Эдуард',
    inviteUrl: 'https://ratlist.app/friend-invite/abc123',
    message: null,
  });
  assertMatch(html, /Эдуард/);
  assertEquals(html.includes('undefined'), false);
  assertEquals(html.includes('null'), false);
});

Deno.test('renderFriendInviteText returns plain-text variant', () => {
  const text = renderFriendInviteText({
    senderName: 'Эдуард',
    inviteUrl: 'https://ratlist.app/friend-invite/abc123',
    message: null,
  });
  assertEquals(text.includes('<'), false);
  assertMatch(text, /Эдуард/);
  assertMatch(text, /ratlist\.app/);
});
