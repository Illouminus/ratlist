/**
 * `<AddFriendModal>` — one modal, two friending paths side-by-side.
 *
 *   1. Email + optional message → `create_friend_invite` RPC →
 *      `send-friend-invite` Edge Function → "invitation sent" toast.
 *   2. The caller's own `add_me_token` link, rendered read-only, with
 *      copy-to-clipboard + rotate buttons.
 *
 * The two paths sit in one dialog so the user can pick whichever
 * channel they have for their friend (email vs Telegram/WhatsApp). No
 * tabs, no flow — both visible at once, separated by a small divider.
 *
 * Modal chrome (overlay + paper card + focus trap + Esc) follows the
 * canonical `<ShareDialog>` pattern. Clipboard uses
 * `navigator.clipboard.writeText` — same path as the share-token dialog.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useI18n } from '../i18n/useI18n';
import { useToast } from './useToast';
import { useProfile } from '../auth/useProfile';
import { errorMessage } from '../lib/errors';
import { useFocusTrap } from '../lib/useFocusTrap';
import { Field } from './Field';
import { SketchInput } from './SketchInput';

export interface AddFriendModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddFriendModal({ open, onClose }: AddFriendModalProps) {
  const { t } = useI18n();
  const toast = useToast();
  const { query, refresh: refreshProfile } = useProfile();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(cardRef, open);

  // Esc closes — paired with the focus trap so keyboard users can both
  // dismiss and stay oriented inside the dialog.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const profile = query.status === 'ready' ? query.profile : null;
  const addMeUrl = profile?.add_me_token
    ? `${window.location.origin}/add-me/${profile.add_me_token}`
    : '';

  async function submitEmail(): Promise<void> {
    setBusy(true);
    const { data: token, error } = await supabase.rpc('create_friend_invite', {
      _email: email,
      _message: message || undefined,
    });
    if (error) {
      toast.show(errorMessage(t, error));
      setBusy(false);
      return;
    }
    const { error: fnErr } = await supabase.functions.invoke('send-friend-invite', {
      body: { token, email },
    });
    setBusy(false);
    if (fnErr) {
      toast.show(t('errors.sendFailed'));
      return;
    }
    toast.show(t('addFriend.emailSent'));
    setEmail('');
    setMessage('');
    onClose();
  }

  async function copyLink(): Promise<void> {
    if (!addMeUrl) return;
    try {
      await navigator.clipboard.writeText(addMeUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — fall through silently */
    }
  }

  async function rotateLink(): Promise<void> {
    const { error } = await supabase.rpc('rotate_add_me_token');
    if (error) {
      toast.show(errorMessage(t, error));
      return;
    }
    await refreshProfile();
    toast.show(t('addFriend.linkRotated'));
  }

  const canSubmit = email.trim().length > 0 && !busy;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('addFriend.title')}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(43, 38, 32, 0.45)',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--s-4)',
        zIndex: 1100,
        animation: 'fadeIn var(--motion) ease-out',
      }}
    >
      <div
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        className="fade-up"
        style={{
          width: 'min(520px, 100%)',
          background: 'var(--paper)',
          border: '1px solid var(--hair-strong)',
          padding: 'var(--s-5)',
          borderRadius: 'var(--r-3)',
          boxShadow: '0 16px 40px rgba(43, 38, 32, 0.25)',
          maxHeight: 'calc(100vh - var(--s-6))',
          overflowY: 'auto',
        }}
      >
        <h2
          className="display-italic"
          style={{
            margin: 0,
            fontSize: 'var(--display-s)',
            lineHeight: 1.15,
            letterSpacing: -0.5,
            color: 'var(--ink)',
          }}
        >
          {t('addFriend.title')}
        </h2>

        {/* — email path — */}
        <section style={{ marginTop: 'var(--s-4)' }}>
          <Field label={t('addFriend.emailLabel')}>
            <SketchInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('addFriend.emailPlaceholder')}
              autoComplete="email"
            />
          </Field>
          <Field label={t('addFriend.emailMessageLabel')}>
            <SketchInput
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('addFriend.emailMessagePlaceholder')}
            />
          </Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <PrimaryAction onClick={submitEmail} disabled={!canSubmit}>
              {t('addFriend.emailSubmit')}
            </PrimaryAction>
          </div>
        </section>

        <div
          className="mono-meta"
          style={{
            margin: 'var(--s-5) 0 var(--s-4)',
            textAlign: 'center',
            color: 'var(--ink-3)',
          }}
        >
          {t('addFriend.divider')}
        </div>

        {/* — add-me link path — */}
        <section>
          <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
            {t('addFriend.linkLabel')}
          </div>
          <div
            style={{
              padding: '10px 12px',
              background: '#fffdf6',
              border: '1px solid var(--hair-strong)',
              borderRadius: 'var(--r-2)',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: 'var(--ink)',
              wordBreak: 'break-all',
              lineHeight: 1.4,
            }}
          >
            {addMeUrl || '…'}
          </div>
          <p
            className="marginalia"
            style={{
              margin: 'var(--s-2) 0 var(--s-3)',
              color: 'var(--ink-3)',
              fontSize: 13,
            }}
          >
            {t('addFriend.linkHint')}
          </p>
          <div
            style={{
              display: 'flex',
              gap: 'var(--s-3)',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
            }}
          >
            <GhostAction onClick={rotateLink} disabled={busy}>
              {t('addFriend.linkRotate')}
            </GhostAction>
            <PrimaryAction onClick={copyLink} disabled={busy || !addMeUrl}>
              {copied ? t('addFriend.linkCopied') : t('addFriend.linkCopy')}
            </PrimaryAction>
          </div>
        </section>

        <div
          style={{
            marginTop: 'var(--s-5)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <GhostAction onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </GhostAction>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── small button atoms ───────────────────────

interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

/** Primary action — accent-filled, used for the email submit + copy. */
function PrimaryAction({ onClick, disabled, children }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mono-meta"
      style={{
        background: disabled ? 'var(--paper-edge)' : 'var(--ink)',
        color: disabled ? 'var(--ink-3)' : 'var(--paper)',
        border: 'none',
        padding: '8px 14px',
        borderRadius: 'var(--r-2)',
        cursor: disabled ? 'default' : 'pointer',
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

/** Ghost action — outlined, used for rotate + cancel. */
function GhostAction({ onClick, disabled, children }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mono-meta"
      style={{
        background: 'transparent',
        color: 'var(--ink-2)',
        border: '1px solid var(--hair-strong)',
        padding: '8px 14px',
        borderRadius: 'var(--r-2)',
        cursor: disabled ? 'default' : 'pointer',
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}
