/**
 * `EventsScreen` — list of every event the caller can see (own + audience).
 *
 * Slice 1 is read-only: header + list. The "new event" flow lands in
 * slice 2 (`CreateEventScreen` at `/events/new`); for now there's a
 * placeholder link so the empty state isn't a dead end.
 *
 * Same editorial shape as `SantaListScreen`: paper background, eyebrow
 * label, italic display heading, hairline-separated rows.
 */
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { useEvents, type MyEvent } from '../../events/useEvents';
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

  return (
    <section>
      <div className="mono-meta" style={{ marginBottom: 'var(--s-3)', color: 'var(--ink-3)' }}>
        {t('events.yours')}
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
        {query.events.map((e) => (
          <EventRow key={e.id} event={e} />
        ))}
      </ul>
    </section>
  );
}

function EventRow({ event }: { event: MyEvent }) {
  const { t } = useI18n();

  // "Birthday · 23 May 2026 · 4 items"-style meta line, comma-separated
  // pieces that render naturally even when occurs_on is null.
  const meta: string[] = [];
  meta.push(t(`events.kind.${event.kind}`));
  if (event.occurs_on) meta.push(formatDate(event.occurs_on));
  meta.push(t('events.itemCount', { count: String(event.item_count) }));

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
          <span className="mono-meta" style={{ color: 'var(--ink-3)' }}>
            {event.is_honoree
              ? t('events.yoursMarker')
              : t('events.honoredBy', { name: event.honoree_display_name })}
          </span>
          {meta.map((m, i) => (
            <span key={i} className="mono-meta" style={{ color: 'var(--ink-3)' }}>
              · {m}
            </span>
          ))}
        </div>
      </div>
      <Link
        to={`/events/${event.id}`}
        className="mono-meta"
        style={{ color: 'var(--accent)', textDecoration: 'none' }}
      >
        {t('events.open')}
      </Link>
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
