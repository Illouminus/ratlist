/**
 * Branded HTML for a group invitation email. Like the other
 * transactional templates: inline styles only, table-wrapped CTA,
 * no external resources.
 *
 * The recipient is identified only by email here — they may not
 * have an account yet, so we don't have a display name to greet
 * them with. "Hi there," is the neutral fallback.
 *
 * If the inviter wrote a note when generating the invite (the
 * optional `invites.note` column), it renders as a small italic
 * paragraph under the body. Nice for "Maša, family circle, mom"
 * style hand-off notes.
 */

export interface GroupInviteEmailInput {
  organizerName: string;
  groupName: string;
  inviteUrl: string;
  /** The optional invite note. Null/empty hides the block. */
  note: string | null;
  /** Days until the invite token expires. Pre-computed by the caller. */
  expiresInDays: number;
}

export function renderGroupInviteEmail(input: GroupInviteEmailInput): string {
  const { organizerName, groupName, inviteUrl, note, expiresInDays } = input;
  const e = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const noteBlock = note && note.trim().length > 0
    ? `<p style="margin:16px 0 0;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:15px;line-height:1.55;color:#5a5147;border-left:2px solid #9b4e31;padding-left:14px;">&ldquo;${e(note.trim())}&rdquo;</p>`
    : '';

  const expiryNote = expiresInDays > 0
    ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:#5a5147;">The invite link works for ${expiresInDays} ${expiresInDays === 1 ? 'more day' : 'more days'}.</p>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>You're invited to ${e(groupName)} on Rat List</title>
  </head>
  <body style="margin:0;padding:0;background:#fbf6ef;color:#2b2620;font-family:'Public Sans','Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fbf6ef;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
          <tr><td style="padding:8px 8px 24px;">
            <span style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:500;font-size:26px;letter-spacing:-0.5px;color:#2b2620;">Rat List</span>
            <span style="font-family:'Caveat','Brush Script MT',cursive;font-size:18px;color:#9b4e31;margin-left:10px;">— wishlist for the rats</span>
          </td></tr>

          <tr><td style="padding:0 8px;">
            <div style="text-transform:uppercase;letter-spacing:0.2em;font-size:11px;color:#5a5147;margin-bottom:12px;">invitation · friend circle</div>
            <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:500;font-size:32px;line-height:1.15;letter-spacing:-0.5px;color:#2b2620;">you've been invited.</h1>
          </td></tr>

          <tr><td style="padding:24px 8px 0;">
            <p style="margin:0;font-size:15px;line-height:1.55;color:#2b2620;">
              Hi there,
              <strong style="color:#2b2620;">${e(organizerName)}</strong> wants you in
              «<em style="font-family:Georgia,'Times New Roman',serif;font-style:italic;">${e(groupName)}</em>»
              on Rat List — a quiet, ad-free wishlist and Secret Santa for friend circles.
            </p>
            ${noteBlock}
            ${expiryNote}
          </td></tr>

          <tr><td style="padding:32px 8px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center" style="background:#2b2620;border-radius:6px;">
                <a href="${e(inviteUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:'Public Sans','Helvetica Neue',Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#fbf6ef;text-decoration:none;">accept invite →</a>
              </td></tr>
            </table>
          </td></tr>

          <tr><td style="padding:16px 8px 0;">
            <p style="margin:0;font-size:12px;line-height:1.5;color:#5a5147;">Or paste this URL into your browser:</p>
            <p style="margin:4px 0 0;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12px;line-height:1.5;color:#2b2620;word-break:break-all;">
              <a href="${e(inviteUrl)}" style="color:#9b4e31;text-decoration:underline;">${e(inviteUrl)}</a>
            </p>
          </td></tr>

          <tr><td style="padding:24px 8px 0;">
            <p style="margin:0;font-size:13px;line-height:1.55;color:#5a5147;">
              If you don't already have an account, the link will let you sign in
              with a one-time email link and accept in the same step.
              If you weren't expecting this, you can ignore it — no account is
              created until you click.
            </p>
          </td></tr>

          <tr><td style="padding:40px 8px 0;">
            <div style="height:1px;background:rgba(43,38,32,0.18);line-height:1px;font-size:1px;">&nbsp;</div>
          </td></tr>

          <tr><td style="padding:16px 8px 0;">
            <p style="margin:0 0 8px;font-family:'Caveat','Brush Script MT',cursive;font-size:16px;color:#5a5147;">wishlist for the rats</p>
            <p style="margin:0;font-size:11px;line-height:1.5;color:#5a5147;text-transform:uppercase;letter-spacing:0.15em;">
              <a href="https://ratlist.app/" style="color:#5a5147;text-decoration:none;">ratlist.app</a>
              &nbsp;·&nbsp;
              <a href="https://ratlist.app/legal/privacy" style="color:#5a5147;text-decoration:none;">privacy</a>
              &nbsp;·&nbsp;
              <a href="https://ratlist.app/legal/terms" style="color:#5a5147;text-decoration:none;">terms</a>
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function renderGroupInviteText(input: GroupInviteEmailInput): string {
  const { organizerName, groupName, inviteUrl, note, expiresInDays } = input;
  const lines: string[] = [
    `Hi there,`,
    '',
    `${organizerName} wants you in «${groupName}» on Rat List — a quiet, ad-free wishlist and Secret Santa for friend circles.`,
  ];
  if (note && note.trim().length > 0) {
    lines.push('', `"${note.trim()}"`);
  }
  lines.push('', 'Accept the invite:', inviteUrl);
  if (expiresInDays > 0) {
    lines.push('', `The link works for ${expiresInDays} more ${expiresInDays === 1 ? 'day' : 'days'}.`);
  }
  lines.push(
    '',
    `If you don't already have an account, the link will let you sign in with a one-time email link and accept in the same step.`,
    '',
    '— Rat List · wishlist for the rats',
    'https://ratlist.app/',
  );
  return lines.join('\n');
}
