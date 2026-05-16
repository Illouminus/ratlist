/**
 * `PeopleScreen` — directory of users I share at least one group with.
 * Tap a card to view that person's list at /p/:userId.
 *
 * Loaded via the `get_people` RPC (see `usePeople`).
 */
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { usePeople, type Person } from '../../people/usePeople';
import { PaperLayout } from '../../components/PaperLayout';
import { SittingRat } from '../../components/rats';

export function PeopleScreen() {
  const { t } = useI18n();
  const { query } = usePeople();

  return (
    <PaperLayout>
      <header style={{ position: 'relative', marginBottom: 'var(--s-5)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
          {t('people.eyebrow')}
        </div>
        <h2
          className="display-italic"
          style={{
            fontSize: 'var(--display-l)',
            margin: 0,
            lineHeight: 1.02,
            letterSpacing: -1.2,
            paddingRight: 56,
            whiteSpace: 'pre-line',
          }}
        >
          {t('people.title')}
        </h2>
        <p
          className="marginalia"
          style={{
            fontSize: 18,
            color: 'var(--accent)',
            marginTop: 'var(--s-2)',
            transform: 'rotate(-1.5deg)',
            display: 'inline-block',
          }}
        >
          {t('people.annotation')}
        </p>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 8,
            right: 0,
            opacity: 0.7,
            pointerEvents: 'none',
          }}
        >
          <SittingRat size={40} />
        </div>
      </header>

      <p
        style={{
          fontSize: 13,
          color: 'var(--ink-2)',
          marginTop: 0,
          marginBottom: 'var(--s-4)',
          maxWidth: 560,
          lineHeight: 1.55,
        }}
      >
        {t('people.sub')}
      </p>

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '0 0 var(--s-2)' }} />

      {query.status === 'loading' && (
        <div className="mono-meta" style={{ color: 'var(--ink-3)' }}>
          …
        </div>
      )}
      {query.status === 'error' && (
        <p style={{ color: 'var(--accent-deep)' }}>{query.error}</p>
      )}
      {query.status === 'ready' && query.people.length === 0 && <EmptyState />}
      {query.status === 'ready' && query.people.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {query.people.map((p) => (
            <PersonRow key={p.id} person={p} />
          ))}
        </ul>
      )}
    </PaperLayout>
  );
}

// ─────────────────────────── row ───────────────────────────

function PersonRow({ person }: { person: Person }) {
  const { t } = useI18n();
  // Link the whole row so the tap target spans the full width on mobile,
  // not just the small "open list →" link in the corner.
  return (
    <li style={{ borderBottom: '1px solid var(--hair)' }}>
      <Link
        to={`/p/${person.id}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-4)',
          padding: 'var(--s-4) 0',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <Avatar name={person.display_name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 'var(--s-2)',
            }}
          >
            <h3
              className="display-italic"
              style={{
                margin: 0,
                fontSize: 'var(--display-xs)',
                lineHeight: 1.1,
                color: 'var(--ink)',
              }}
            >
              {person.handle ? `${person.handle}'s list` : person.display_name}
            </h3>
            <span
              className="mono-meta"
              style={{ color: 'var(--ink-3)', fontFeatureSettings: '"tnum"' }}
            >
              {t('people.sharedGroups', { count: person.shared_group_count })}
            </span>
          </div>
          {person.handle && (
            <div
              style={{
                marginTop: 2,
                fontSize: 12,
                color: 'var(--ink-3)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {person.display_name}
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}

// ─────────────────────────── empty / avatar ───────────────────────────

function EmptyState() {
  const { t } = useI18n();
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
          {t('people.empty')}
        </p>
        <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('people.emptyBody')}</p>
      </div>
      <div style={{ opacity: 0.85 }}>
        <SittingRat size={72} signText="alone?" />
      </div>
    </section>
  );
}

/** Simple circular initial badge in the accent wash colour. */
function Avatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      style={{
        width: 40,
        height: 40,
        flexShrink: 0,
        borderRadius: '50%',
        background: 'var(--accent-wash)',
        color: 'var(--ink)',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'var(--font-display)',
        fontStyle: 'italic',
        fontWeight: 500,
        fontSize: 18,
        boxShadow: 'inset 0 0 0 1px var(--hair-strong)',
      }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
