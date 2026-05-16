/**
 * `<InviteList>` — active invite tokens for a single group, with controls
 * to generate, copy, and revoke. Rendered inside a `<GroupCard>` once the
 * card is expanded.
 *
 * Visibility model:
 *   - anyone in the group can see and create invites (per RLS)
 *   - the creator (or a group admin) can revoke
 * For v0.1 we don't bother hiding the revoke button — RLS will reject any
 * unauthorised delete, and we'd rather show a stable UI than juggle perms.
 */
import { useState } from 'react';
import type { Invite } from '../../lib/db';
import { useGroupInvites } from '../../groups/useGroupInvites';
import { useI18n } from '../../i18n/useI18n';
import { Button } from '../../components/Button';

interface InviteListProps {
  groupId: string;
}

export function InviteList({ groupId }: InviteListProps) {
  const { t } = useI18n();
  const { query, generate, revoke } = useGroupInvites(groupId);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(): Promise<void> {
    setGenerating(true);
    setError(null);
    const result = await generate();
    if ('error' in result) setError(result.error);
    setGenerating(false);
  }

  return (
    <div style={{ marginTop: 'var(--s-4)' }}>
      <div
        className="mono-meta"
        style={{ marginBottom: 'var(--s-3)', color: 'var(--ink-3)' }}
      >
        {t('groups.invitesTitle')}
      </div>

      {query.status === 'loading' && (
        <div className="mono-meta" style={{ color: 'var(--ink-3)' }}>…</div>
      )}

      {query.status === 'error' && (
        <p style={{ color: 'var(--accent-deep)', fontSize: 13 }}>{query.error}</p>
      )}

      {query.status === 'ready' && query.invites.length === 0 && (
        <p style={{ color: 'var(--ink-3)', fontSize: 13, marginBottom: 'var(--s-3)' }}>
          {t('groups.invitesEmpty')}
        </p>
      )}

      {query.status === 'ready' &&
        query.invites.map((inv) => (
          <InviteRow key={inv.token} invite={inv} onRevoke={() => void revoke(inv.token)} />
        ))}

      <Button
        variant="ghost"
        onClick={() => void handleGenerate()}
        disabled={generating}
        style={{ marginTop: 'var(--s-3)', color: 'var(--accent)' }}
      >
        + {generating ? t('groups.generating') : t('groups.generateInvite')}
      </Button>

      {error && (
        <p style={{ color: 'var(--accent-deep)', fontSize: 13, marginTop: 'var(--s-3)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ───────────────────────────── invite row ─────────────────────────────

interface InviteRowProps {
  invite: Invite;
  onRevoke: () => void;
}

/** Days remaining until the invite expires. Floor-rounded, min 0. */
function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${encodeURIComponent(token)}`;
}

function InviteRow({ invite, onRevoke }: InviteRowProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteUrl(invite.token));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — non-fatal */
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s-3)',
        padding: 'var(--s-2) 0',
        borderTop: '1px solid var(--hair)',
        flexWrap: 'wrap',
      }}
    >
      <code
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: 'monospace',
          fontSize: 12,
          color: 'var(--ink-2)',
        }}
      >
        {inviteUrl(invite.token)}
      </code>
      <span className="mono-meta" style={{ color: 'var(--ink-3)' }}>
        {t('groups.inviteExpiresIn', { days: daysUntil(invite.expires_at) })}
      </span>
      <Button variant="ghost" onClick={() => void copy()}>
        {copied ? t('groups.copied') : t('groups.copyLink')}
      </Button>
      <Button variant="ghost" onClick={onRevoke} style={{ color: 'var(--accent-deep)' }}>
        {t('groups.revokeInvite')}
      </Button>
    </div>
  );
}
