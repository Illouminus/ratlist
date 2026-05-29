/**
 * `EventsScreen` — list of every event the caller can see, including
 * pending invitations.
 *
 * Pending rows show an "invitation from {inviter}" badge with inline
 * Accept (calls join_event_via_token, navigates into the event) and
 * Decline (UPDATEs the participant row to status='declined' — RLS
 * permits the own-row update). Honoree + active rows render as before.
 *
 * Same editorial shape as `SantaListScreen`: paper background, eyebrow
 * label, italic display heading, hairline-separated rows.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { useEvents, type MyEvent } from '../../events/useEvents';
import { useAuth } from '../../auth/useAuth';
import { useToast } from '../../components/useToast';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { PaperLayout } from '../../components/PaperLayout';
import { SittingRat } from '../../components/rats';
import { ListSkeleton } from '../../components/Skeleton';

export function EventsScreen() {
  const { t } = useI18n();
  const { query } = useEvents();

  const hasEvents = query.status === 'ready' && query.events.length > 0;

  return (
    <PaperLayout>
      <header style={{ marginBottom: 'var(--s-6)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 'var(--s-4)',
            marginBottom: 'var(--s-3)',
          }}
        >
          <div className="mono-meta">{t('events.eyebrow')}</div>
          {hasEvents && (
            <Link
              to="/events/new"
              className="mono-meta"
              style={{ color: 'var(--accent)', textDecoration: 'none' }}
            >
              {t('events.createCta')}
            </Link>
          )}
        </div>
        <h2
          className="display-italic"
          style={{ fontSize: 'var(--display-m)', margin: 0, lineHeight: 1.1, letterSpacing: -1 }}
        >
          {t('events.title')}
        </h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--ink-2)',
            marginTop: 'var(--s-3)',
            maxWidth: 560,
            lineHeight: 1.55,
          }}
        >
          {t('events.sub')}
        </p>
      </header>

      <EventList query={query} />

      {/* Secondary entry to Secret Santa — demoted from primary nav
          (seasonal, off the core loop) but still findable year-round.
          A quiet hairline-separated link, not a section of its own. */}
      <div
        style={{
          marginTop: 'var(--s-7)',
          paddingTop: 'var(--s-4)',
          borderTop: '1px solid var(--hair)',
        }}
      >
        <Link
          to="/santa"
          className="mono-meta"
          style={{ color: 'var(--ink-2)', textDecoration: 'none' }}
        >
          {t('events.santaEntry')}
        </Link>
      </div>
    </PaperLayout>
  );
}

// ─────────────────────────── list ───────────────────────────

function EventList({ query }: { query: ReturnType<typeof useEvents>['query'] }) {
  const { t } = useI18n();

  if (query.status === 'loading') return <ListSkeleton rows={3} />;
  if (query.status === 'error') {
    return <p style={{ color: 'var(--accent-deep)' }}>{query.error}</p>;
  }
  if (query.status === 'anonymous') return null;

  if (query.events.length === 0) {
    return (
      <section
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--s-6)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <p
            className="display-italic"
            style={{ fontSize: 22, color: 'var(--ink-2)', marginBottom: 'var(--s-2)' }}
          >
            {t('events.empty')}
          </p>
          <p style={{ color: 'var(--ink-3)', fontSize: 14, marginBottom: 'var(--s-4)' }}>
            {t('events.emptyBody')}
          </p>
          {/* Placeholder — the real CreateEventScreen lands in slice 2.
              We still surface the affordance now so the empty state
              isn't a wall. */}
          <Link
            to="/events/new"
            className="mono-meta"
            style={{ color: 'var(--accent)', textDecoration: 'none' }}
          >
            {t('events.createCta')}
          </Link>
        </div>
        <div style={{ opacity: 0.85 }}>
          <SittingRat size={72} signText="✶" />
        </div>
      </section>
    );
  }

  // Split by my_status so each social bucket gets its own section. Order
  // is intentional: pending sits first (most actionable — every row has
  // accept/decline buttons), then own events, then joined ones. Within
  // each section the hook already orders by occurs_on/created_at.
  const pendingEvents = query.events.filter((e) => e.my_status === 'pending');
  const honoreeEvents = query.events.filter((e) => e.my_status === 'honoree');
  const activeEvents = query.events.filter((e) => e.my_status === 'active');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-7)' }}>
      {pendingEvents.length > 0 && (
        <EventSection title={t('events.sectionPending')} events={pendingEvents} />
      )}
      {honoreeEvents.length > 0 && (
        <EventSection title={t('events.sectionHonoree')} events={honoreeEvents} />
      )}
      {activeEvents.length > 0 && (
        <EventSection title={t('events.sectionActive')} events={activeEvents} />
      )}
    </div>
  );
}

function EventSection({ title, events }: { title: string; events: MyEvent[] }) {
  return (
    <section>
      <div className="mono-meta" style={{ marginBottom: 'var(--s-3)', color: 'var(--ink-3)' }}>
        {title}
      </div>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-4)',
        }}
      >
        {events.map((e) => (
          <EventRow key={e.id} event={e} />
        ))}

      </ul>
    </section>
  );
}

function EventRow({ event }: { event: MyEvent }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const isPending = event.my_status === 'pending';

  // "Birthday · 23 May 2026 · 4 items"-style meta line, comma-separated
  // pieces that render naturally even when occurs_on is null.
  const meta: string[] = [];
  meta.push(t(`events.kind.${event.kind}`));
  if (event.occurs_on) meta.push(formatDate(event.occurs_on));
  meta.push(t('events.itemCount', { count: String(event.item_count) }));

  async function handleAccept() {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('join_event_via_token', {
      _token: event.share_token,
    });
    if (error) {
      toast.show(errorMessage(t, error));
      setBusy(false);
      return;
    }
    navigate(`/events/${data as string}`);
  }

  async function handleDecline() {
    if (busy || !user) return;
    setBusy(true);
    const { error } = await supabase
      .from('event_participants')
      .update({ status: 'declined' })
      .eq('event_id', event.id)
      .eq('user_id', user.id);
    if (error) {
      toast.show(errorMessage(t, error));
      setBusy(false);
      return;
    }
    toast.show(t('events.pending.declinedToast'));
    setBusy(false);
    // useEvents realtime subscription will pull the change; no manual refresh.
  }

  return (
    <li
      style={{
        padding: 'var(--s-5)',
        background: '#fffdf6',
        border: '1px solid var(--hair)',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 'var(--s-4)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <h3
          className="display-italic"
          style={{ margin: 0, fontSize: 22, letterSpacing: -0.4 }}
        >
          {event.title}
        </h3>
        <div
          style={{
            display: 'flex',
            gap: 'var(--s-3)',
            alignItems: 'baseline',
            marginTop: 'var(--s-2)',
            flexWrap: 'wrap',
          }}
        >
          {isPending ? (
            <span
              className="mono-meta"
              style={{
                color: 'var(--accent)',
                fontWeight: 600,
              }}
            >
              {t('events.pending.invitedBy', { name: event.honoree_display_name })}
            </span>
          ) : (
            <span className="mono-meta" style={{ color: 'var(--ink-3)' }}>
              {event.my_status === 'honoree'
                ? t('events.yoursMarker')
                : t('events.honoredBy', { name: event.honoree_display_name })}
            </span>
          )}
          {meta.map((m, i) => (
            <span key={i} className="mono-meta" style={{ color: 'var(--ink-3)' }}>
              · {m}
            </span>
          ))}
        </div>
      </div>
      {isPending ? (
        <div style={{ display: 'flex', gap: 'var(--s-3)', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => void handleDecline()}
            disabled={busy}
            className="mono-meta"
            style={{
              background: 'transparent',
              border: '1px solid var(--hair-strong)',
              color: 'var(--ink-2)',
              padding: '6px 12px',
              cursor: busy ? 'default' : 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
            }}
          >
            {t('events.pending.decline')}
          </button>
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={busy}
            style={{
              background: busy ? 'var(--ink-3)' : 'var(--accent)',
              color: 'var(--paper)',
              border: 'none',
              padding: '6px 12px',
              cursor: busy ? 'default' : 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {t('events.pending.accept')}
          </button>
        </div>
      ) : (
        <Link
          to={`/events/${event.id}`}
          className="mono-meta"
          style={{ color: 'var(--accent)', textDecoration: 'none' }}
        >
          {t('events.open')}
        </Link>
      )}
    </li>
  );
}

/** Locale-agnostic "23 May 2026" / "23 мая 2026". Falls back to ISO on
 * parse failure so a bad backend value doesn't crash the row. */
function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
