/**
 * Branded HTML for the "X started a Secret Santa, join" invitation.
 * Same constraints as the draw-complete template:
 *
 *   - inline styles only
 *   - table-based CTA for Outlook
 *   - no external resources
 *   - verbatim URL fallback below the button
 */

export interface SantaStartEmailInput {
  recipientName: string;
  organizerName: string;
  eventName: string;
  groupName: string;
  eventUrl: string;
  /** Optional. Pre-formatted by the caller — we don't do date math here. */
  drawDeadlineText: string | null;
}

export function renderSantaStartEmail(input: SantaStartEmailInput): string {
  const {
    recipientName,
    organizerName,
    eventName,
    groupName,
    eventUrl,
    drawDeadlineText,
  } = input;
  const e = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const deadlineLine = drawDeadlineText
    ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:#5a5147;">The draw runs <strong style="color:#2b2620;">${e(drawDeadlineText)}</strong> — make sure your wishlist is filled in before then.</p>`
    : `<p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:#5a5147;">Add a few things to your wishlist while you're there — your match will need somewhere to start.</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>You're invited — ${e(eventName)}</title>
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
            <div style="text-transform:uppercase;letter-spacing:0.2em;font-size:11px;color:#5a5147;margin-bottom:12px;">secret santa · new event</div>
            <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:500;font-size:32px;line-height:1.15;letter-spacing:-0.5px;color:#2b2620;">you're invited.</h1>
          </td></tr>

          <tr><td style="padding:24px 8px 0;">
            <p style="margin:0;font-size:15px;line-height:1.55;color:#2b2620;">
              Hi <strong style="color:#2b2620;">${e(recipientName)}</strong>,
              <strong style="color:#2b2620;">${e(organizerName)}</strong> just started
              «<em style="font-family:Georgia,'Times New Roman',serif;font-style:italic;">${e(eventName)}</em>»
              in «<em style="font-family:Georgia,'Times New Roman',serif;font-style:italic;">${e(groupName)}</em>».
              Hop in to join the draw.
            </p>
            ${deadlineLine}
          </td></tr>

          <tr><td style="padding:32px 8px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center" style="background:#2b2620;border-radius:6px;">
                <a href="${e(eventUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:'Public Sans','Helvetica Neue',Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#fbf6ef;text-decoration:none;">join the event →</a>
              </td></tr>
            </table>
          </td></tr>

          <tr><td style="padding:16px 8px 0;">
            <p style="margin:0;font-size:12px;line-height:1.5;color:#5a5147;">Or paste this URL into your browser:</p>
            <p style="margin:4px 0 0;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12px;line-height:1.5;color:#2b2620;word-break:break-all;">
              <a href="${e(eventUrl)}" style="color:#9b4e31;text-decoration:underline;">${e(eventUrl)}</a>
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

export function renderSantaStartText(input: SantaStartEmailInput): string {
  const { recipientName, organizerName, eventName, groupName, eventUrl, drawDeadlineText } = input;
  const lines: string[] = [
    `Hi ${recipientName},`,
    '',
    `${organizerName} just started a Secret Santa called «${eventName}» in «${groupName}». Hop in to join the draw:`,
    eventUrl,
  ];
  if (drawDeadlineText) {
    lines.push('');
    lines.push(`The draw runs ${drawDeadlineText} — make sure your wishlist is filled in before then.`);
  }
  lines.push('', '— Rat List · wishlist for the rats', 'https://ratlist.app/');
  return lines.join('\n');
}
