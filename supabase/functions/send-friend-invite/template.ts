/** Plain-text variant of the friend-invite email. */
export function renderFriendInviteText(input: {
  senderName: string;
  inviteUrl: string;
  message: string | null;
}): string {
  const msg = input.message ? `\n\n«${input.message}»\n` : '\n';
  return [
    `${input.senderName} зовёт тебя дружить на Rat List.`,
    msg,
    `Перейди по ссылке — если у тебя ещё нет аккаунта, мы предложим завести его.`,
    ``,
    input.inviteUrl,
    ``,
    `— Rat List`,
  ].join('\n');
}

/** Branded HTML email body. Editorial-styled like the other transactional
 *  emails; web-safe Newsreader fallback chain because most email clients
 *  ignore @font-face. */
export function renderFriendInviteEmail(input: {
  senderName: string;
  inviteUrl: string;
  message: string | null;
}): string {
  const safeName = escapeHtml(input.senderName);
  const safeUrl = escapeHtml(input.inviteUrl);
  const messageBlock = input.message
    ? `<p style="font-family:'Newsreader',Georgia,serif; font-style:italic; color:#7d3e23; margin:24px 0; padding:12px 16px; border-left:2px solid #a25433;">«${escapeHtml(input.message)}»</p>`
    : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${safeName} зовёт дружить на Rat List</title></head>
<body style="background:#faf6ef; color:#2b2620; font-family:'Public Sans',-apple-system,Helvetica,sans-serif; padding:40px 16px; margin:0;">
  <div style="max-width:540px; margin:0 auto; background:#fffdf6; border:1px solid rgba(43,38,32,0.12); padding:32px;">
    <p style="font-family:'Newsreader',Georgia,serif; font-style:italic; font-size:24px; margin:0 0 8px; color:#2b2620;">
      ${safeName} зовёт тебя дружить
    </p>
    <p style="color:#5a5147; margin:0 0 24px;">
      на Rat List — это вишлист для своих, без рекламы и алгоритмов.
    </p>
    ${messageBlock}
    <p style="margin:24px 0;">
      <a href="${safeUrl}" style="background:#a25433; color:#faf6ef; padding:14px 28px; text-decoration:none; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; font-size:13px;">
        Принять →
      </a>
    </p>
    <p style="color:#6f6657; font-size:12px; margin:24px 0 0;">
      Если ссылка не работает, скопируй: <br/>
      <span style="word-break:break-all;">${safeUrl}</span>
    </p>
  </div>
  <p style="color:#6f6657; font-size:11px; text-align:center; margin:24px 0 0;">
    Rat List · <a href="https://ratlist.app" style="color:#6f6657;">ratlist.app</a>
  </p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
