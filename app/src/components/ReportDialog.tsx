/**
 * `<ReportDialog>` — modal that lets a viewer flag a public surface
 * (a shared wishlist, a profile, eventually an item or a group) for
 * the operator to triage.
 *
 * Self-contained: caller passes `open`, `onClose`, `targetType` and
 * `targetId`. The dialog handles the reason picker, the optional
 * note, the insert into `public.reports`, and a confirmation toast.
 *
 * RLS lets both anonymous and authenticated callers insert into
 * `reports`, with the constraint that if `reporter_id` is set it
 * must equal `auth.uid()`. We pass the current user id when it's
 * available; otherwise null (legitimate anonymous report from
 * `/share/<token>` viewed by someone without an account).
 *
 * Same chrome as ShareDialog / ConfirmDialog — paper card on a
 * scrim, focus trapped while open, Escape closes.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { useI18n } from '../i18n/useI18n';
import { errorMessage } from '../lib/errors';
import { useFocusTrap } from '../lib/useFocusTrap';
import { useToast } from './Toast';
import { Button } from './Button';

export type ReportTargetType = 'share' | 'profile' | 'item' | 'group';

export type ReportReason = 'spam' | 'nsfw' | 'harassment' | 'illegal' | 'other';

const REASONS: readonly ReportReason[] = ['spam', 'nsfw', 'harassment', 'illegal', 'other'];

export interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
}

export function ReportDialog({ open, onClose, targetType, targetId }: ReportDialogProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusTrap(cardRef, open);

  // Reset every time the dialog is reopened so a previous attempt's
  // state (selected reason, written note) doesn't bleed into a
  // different report.
  useEffect(() => {
    if (open) {
      setReason(null);
      setNote('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(): Promise<void> {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    const { error: insertError } = await supabase.from('reports').insert({
      reporter_id: user?.id ?? null,
      target_type: targetType,
      target_id: targetId,
      reason,
      note: note.trim() ? note.trim().slice(0, 1000) : null,
    });
    setBusy(false);
    if (insertError) {
      setError(errorMessage(t, insertError));
      return;
    }
    toast.show(t('report.toastSent'));
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('report.title')}
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
          width: 'min(480px, 100%)',
          background: 'var(--paper)',
          border: '1px solid var(--hair-strong)',
          padding: 'var(--s-5)',
          borderRadius: 'var(--r-3)',
          boxShadow: '0 16px 40px rgba(43, 38, 32, 0.25)',
        }}
      >
        <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
          {t('report.eyebrow')}
        </div>
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
          {t('report.title')}
        </h2>
        <p
          style={{
            margin: 'var(--s-3) 0 var(--s-4)',
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--ink-2)',
          }}
        >
          {t('report.body')}
        </p>

        {/* Reason picker — radiogroup so screen readers announce the
            selection. Visual is editorial: hairline chips, accent
            border on the selected one. */}
        <div
          role="radiogroup"
          aria-label={t('report.reasonLabel')}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}
        >
          {REASONS.map((r) => {
            const selected = reason === r;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setReason(r)}
                style={{
                  background: selected ? 'var(--accent-soft)' : 'transparent',
                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--hair-strong)'}`,
                  color: selected ? 'var(--accent-deep)' : 'var(--ink-2)',
                  padding: '6px 12px',
                  borderRadius: 'var(--r-2)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  letterSpacing: 0.04,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {t(`report.reason.${r}`)}
              </button>
            );
          })}
        </div>

        <label
          htmlFor="report-note"
          className="mono-meta"
          style={{ display: 'block', marginTop: 'var(--s-4)', color: 'var(--ink-3)' }}
        >
          {t('report.noteLabel')}
        </label>
        <textarea
          id="report-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('report.notePlaceholder')}
          maxLength={1000}
          rows={3}
          style={{
            width: '100%',
            marginTop: 'var(--s-2)',
            padding: '8px 10px',
            background: '#fffdf6',
            border: '1px solid var(--hair-strong)',
            borderRadius: 'var(--r-2)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            lineHeight: 1.4,
            color: 'var(--ink)',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />

        {error && (
          <p
            style={{
              marginTop: 'var(--s-3)',
              color: 'var(--accent-deep)',
              fontSize: 13,
            }}
          >
            {error}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--s-3)',
            marginTop: 'var(--s-5)',
          }}
        >
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('report.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSubmit()}
            disabled={!reason || busy}
          >
            {busy ? t('report.sending') : t('report.submit')}
          </Button>
        </div>
      </div>
    </div>
  );
}
