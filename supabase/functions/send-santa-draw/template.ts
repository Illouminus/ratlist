/**
 * Branded HTML for the "draw complete" notification. Pure render —
 * no data fetching, no I/O. The handler in `index.ts` produces the
 * inputs from the DB.
 *
 * Design constraints, same as `supabase/templates/magic-link.html`:
 *   - inline styles only; <style> blocks survive in Apple Mail and
 *     Thunderbird but Gmail and Outlook flatten them
 *   - table-based CTA so Outlook on Windows renders the button
 *   - no external resources (no <link>, no remote images)
 *   - verbatim URL below the CTA as a fallback when <a> is stripped
 *
 * The matched recipient's display name is deliberately *not* in the
 * email. Mail archives get screenshotted and leaked; require a login
 * to see the match. The email's only job is "the draw happened, come
 * back to the app."
 */

export interface SantaDrawEmailInput {
  giverName: string;
  organizerName: string;
  eventName: string;
  eventUrl: string;
}

export function renderSantaDrawEmail(input: SantaDrawEmailInput): string {
  const { giverName, organizerName, eventName, eventUrl } = input;
  // Defensive escape for the four interpolated values. They're written
  // by users so they could legitimately contain `<`, `&`, quotes, etc.
  // The URL is built server-side from a UUID — escaped here for
  // completeness, not because it's expected to need it.
  const e = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>The draw is done — ${e(eventName)}</title>
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
            <div style="text-transform:uppercase;letter-spacing:0.2em;font-size:11px;color:#5a5147;margin-bottom:12px;">secret santa · draw complete</div>
            <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:500;font-size:32px;line-height:1.15;letter-spacing:-0.5px;color:#2b2620;">your match is ready.</h1>
          </td></tr>

          <tr><td style="padding:24px 8px 0;">
            <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#2b2620;">
              Hi <strong style="color:#2b2620;">${e(giverName)}</strong>,
              <strong style="color:#2b2620;">${e(organizerName)}</strong> just ran the draw for
              «<em style="font-family:Georgia,'Times New Roman',serif;font-style:italic;">${e(eventName)}</em>».
              Open Rat List to see who you've got — and peek at their wishlist while you're there.
            </p>
            <p style="margin:0;font-size:14px;line-height:1.55;color:#5a5147;">
              The match stays between you and the app until the organiser reveals everyone's pairs at the gift exchange.
            </p>
          </td></tr>

          <tr><td style="padding:32px 8px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center" style="background:#2b2620;border-radius:6px;">
                <a href="${e(eventUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:'Public Sans','Helvetica Neue',Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#fbf6ef;text-decoration:none;">open the event →</a>
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

/** Plain-text fallback for clients that don't render HTML. */
export function renderSantaDrawText(input: SantaDrawEmailInput): string {
  const { giverName, organizerName, eventName, eventUrl } = input;
  return [
    `Hi ${giverName},`,
    '',
    `${organizerName} just ran the Secret Santa draw for «${eventName}».`,
    `Open Rat List to see who you've got: ${eventUrl}`,
    '',
    `The match stays between you and the app until the organiser reveals everyone's pairs at the gift exchange.`,
    '',
    '— Rat List · wishlist for the rats',
    'https://ratlist.app/',
  ].join('\n');
}
