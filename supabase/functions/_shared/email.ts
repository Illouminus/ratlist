/**
 * `sendEmail` — thin wrapper around Resend's REST API.
 *
 * Reads `RESEND_API_KEY` from the Edge runtime env. When the key is
 * missing (local dev without secrets, preview deploys without the
 * env var) the function logs the payload to stdout and returns
 * `{ ok: true, id: 'dry-run' }` — call-sites don't need to branch.
 *
 * From-address mirrors the Supabase Auth SMTP setup so transactional
 * mail and magic-link mail share one sender identity. Reply-to is
 * always `hello@ratlist.app` (ImprovMX forwarder → user inbox), so
 * replies don't disappear into a noreply void.
 *
 * Errors come back as `{ ok: false, error }` — no throw. Call-sites
 * are expected to log and continue; we never want a failed
 * notification to break the path that triggered it.
 */

const FROM_ADDRESS = 'Rat List <hello@ratlist.app>';
const REPLY_TO = 'hello@ratlist.app';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text fallback. Some mail clients (Apple Mail in
   *  reading list, certain spam filters) prefer a `text` block. */
  text?: string;
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY');

  if (!apiKey) {
    // Dry-run: log enough to debug without spamming the test inbox.
    console.log('[email:dry-run]', JSON.stringify({
      to: input.to,
      subject: input.subject,
      htmlBytes: input.html.length,
    }));
    return { ok: true, id: 'dry-run' };
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: input.to,
        reply_to: REPLY_TO,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      return { ok: false, error: `resend ${resp.status}: ${body.slice(0, 200)}` };
    }
    const data = (await resp.json()) as { id?: string };
    return { ok: true, id: data.id ?? 'unknown' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return { ok: false, error: message };
  }
}
