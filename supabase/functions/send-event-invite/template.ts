/**
 * `send-event-invite` email rendering.
 *
 * Pre-invite email fired by the InviteFromPeopleModal — a coordinator
 * pings co-event-friends from their People list. The recipient lands
 * on `/event/<token>`, which auto-joins them as an active participant
 * on sign-in. Aesthetic mirrors send-group-invite / send-santa-start:
 * paper background, ink text, terracotta CTA, Newsreader italic
 * display, Public Sans body fallback.
 *
 * RU only for v1 (per spec — EN waits for the brand re-pass). HTML is
 * inline-styled because most clients strip <style> blocks.
 */

export interface EventInviteVars {
  inviterName: string;
  recipientName: string;
  eventTitle: string;
  /** ISO date (YYYY-MM-DD). null = no date set; skip the date line. */
  eventOccursOn: string | null;
  eventUrl: string;
}

export function renderHtml(v: EventInviteVars): string {
  const dateLine = v.eventOccursOn
    ? `<p style="color:#7a7060;font-size:14px;margin:6px 0 0">${escapeHtml(formatDate(v.eventOccursOn))}</p>`
    : '';
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8f5ee;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f5ee;padding:40px 16px">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#fffdf6;border:1px solid #e8e1d2;padding:32px;max-width:520px">
      <tr><td>
        <p style="color:#7a7060;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;margin:0 0 16px">Ты приглашён(а)</p>
        <h1 style="font-family:'Newsreader',Georgia,serif;font-style:italic;font-weight:400;font-size:28px;line-height:1.2;margin:0 0 8px;color:#2a261d">
          ${escapeHtml(v.inviterName)} зовёт тебя
        </h1>
        <p style="margin:0 0 4px;font-size:17px;color:#2a261d">на «${escapeHtml(v.eventTitle)}»</p>
        ${dateLine}
        <table style="margin:28px 0 8px" cellpadding="0" cellspacing="0"><tr><td style="background:#c2603c;border-radius:2px">
          <a href="${escapeAttr(v.eventUrl)}" style="display:block;padding:12px 24px;color:#fffdf6;text-decoration:none;font-size:15px">Открыть →</a>
        </td></tr></table>
        <p style="color:#a09680;font-size:12px;margin:32px 0 0;line-height:1.5">Это автоматическое письмо от Rat List. <a href="https://ratlist.app/settings" style="color:#a09680">Управление уведомлениями</a>.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function renderText(v: EventInviteVars): string {
  const dateLine = v.eventOccursOn ? `\n${formatDate(v.eventOccursOn)}` : '';
  return `Ты приглашён(а).

${v.inviterName} зовёт тебя на «${v.eventTitle}»${dateLine}.

Открыть: ${v.eventUrl}

—
Rat List · автоматическое письмо. Управление уведомлениями: https://ratlist.app/settings
`;
}

function formatDate(iso: string): string {
  // Parse as UTC midnight to avoid TZ-shifting the calendar day.
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(d);
  } catch {
    return iso;
  }
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c] ?? c);
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
