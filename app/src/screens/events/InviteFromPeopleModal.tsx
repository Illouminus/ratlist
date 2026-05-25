/**
 * `InviteFromPeopleModal` — coordinator picks people to invite to an
 * event from their auto-populated People list.
 *
 * Submit fires two requests in sequence:
 *   1. `invite_to_event` RPC (SECURITY INVOKER, RLS-gated) — bulk
 *      INSERT of pending event_participants rows.
 *   2. `send-event-invite` Edge Function — fire-and-forget email send.
 *      If it fails, the pending rows are still in place; the recipient
 *      sees the event in their /events list with a pending badge, and
 *      the coordinator can re-trigger via D.5's per-row resend action.
 *
 * Errors on (1) keep the modal open so the user sees the toast and can
 * retry. (2) failures are silent — the in-app entry is the primary
 * surface, email is best-effort.
 */
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { usePeople } from '../../people/usePeople';
import { useI18n } from '../../i18n/useI18n';
import { errorMessage } from '../../lib/errors';

interface Props {
  eventId: string;
  open: boolean;
  onClose: () => void;
  /** Coordinator-side toast — passed in rather than imported so this
   *  modal stays callable from anywhere without dragging the toast
   *  provider context. */
  showToast: (msg: string) => void;
}

export function InviteFromPeopleModal({ eventId, open, onClose, showToast }: Props) {
  const { t } = useI18n();
  const { query } = usePeople();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const people = query.status === 'ready' ? query.people : [];
  const selectedIds = [...selected];
  const submitLabel =
    selectedIds.length === 1
      ? t('events.invite.submitOne')
      : t('events.invite.submitMany', { count: selectedIds.length });
  const successLabel =
    selectedIds.length === 1
      ? t('events.invite.successOne')
      : t('events.invite.successMany', { count: selectedIds.length });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (selectedIds.length === 0 || submitting) return;
    setSubmitting(true);

    const { error: rpcErr } = await supabase.rpc('invite_to_event', {
      _event_id: eventId,
      _user_ids: selectedIds,
    });
    if (rpcErr) {
      showToast(errorMessage(t, rpcErr));
      setSubmitting(false);
      return;
    }

    // Fire-and-forget — email is best-effort.
    void supabase.functions
      .invoke('send-event-invite', {
        body: { event_id: eventId, user_ids: selectedIds },
      })
      .catch(() => {
        /* email failure doesn't block the in-app invite */
      });

    showToast(successLabel);
    setSelected(new Set());
    setSubmitting(false);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(38, 32, 22, 0.42)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 'var(--s-4)',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--hair)',
          padding: 'var(--s-6)',
          maxWidth: 480,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 12px 40px rgba(38, 32, 22, 0.18)',
        }}
      >
        <h2
          id="invite-modal-title"
          className="display-italic"
          style={{
            margin: 0,
            fontSize: 'var(--display-s)',
            lineHeight: 1.1,
          }}
        >
          {t('events.invite.modalTitle')}
        </h2>

        {people.length === 0 ? (
          <p
            style={{
              color: 'var(--ink-3)',
              fontSize: 14,
              fontStyle: 'italic',
              marginTop: 'var(--s-4)',
            }}
          >
            {t('events.invite.empty')}
          </p>
        ) : (
          <>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 'var(--s-4) 0 var(--s-3)',
                maxHeight: 300,
                overflowY: 'auto',
                borderTop: '1px solid var(--hair)',
              }}
            >
              {people.map((p) => (
                <li
                  key={p.id}
                  style={{
                    borderBottom: '1px solid var(--hair)',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--s-3)',
                      padding: 'var(--s-3) 0',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      aria-label={p.display_name}
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 15 }}>
                      {p.display_name}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p
              className="mono-meta"
              style={{ color: 'var(--ink-3)', fontSize: 12, margin: '0 0 var(--s-4)' }}
            >
              {t('events.invite.modalHint')}
            </p>
          </>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 'var(--s-3)',
            marginTop: 'var(--s-4)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="mono-meta"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: 'var(--ink-3)',
              cursor: submitting ? 'default' : 'pointer',
            }}
          >
            {t('events.invite.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || selectedIds.length === 0}
            style={{
              background:
                submitting || selectedIds.length === 0 ? 'var(--ink-3)' : 'var(--accent)',
              color: 'var(--paper)',
              border: 'none',
              padding: '8px 16px',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              fontWeight: 600,
              cursor:
                submitting || selectedIds.length === 0 ? 'default' : 'pointer',
            }}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
