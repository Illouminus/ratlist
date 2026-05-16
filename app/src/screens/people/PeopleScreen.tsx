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
import { TopBar } from '../../components/TopBar';
import { TopBarNav } from '../../components/TopBarNav';

export function PeopleScreen() {
  const { t } = useI18n();
  const { query } = usePeople();

  return (
    <PaperLayout>
      <TopBar nav={<TopBarNav />} />

      <header style={{ marginBottom: 'var(--s-6)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-3)' }}>
          {t('people.eyebrow')}
        </div>
        <h2
          className="display-italic"
          style={{ fontSize: 40, margin: 0, lineHeight: 1.1, letterSpacing: -1 }}
        >
          {t('people.title')}
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
          {t('people.sub')}
        </p>
      </header>

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '0 0 var(--s-5)' }} />

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
  return (
    <li
      style={{
        padding: 'var(--s-4) 0',
        borderBottom: '1px solid var(--hair)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s-4)',
      }}
    >
      <Avatar name={person.display_name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="display-italic" style={{ fontSize: 22, lineHeight: 1.2 }}>
          {person.display_name}
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'baseline', marginTop: 2 }}>
          {person.handle && (
            <span className="mono-meta" style={{ color: 'var(--ink-3)' }}>
              @{person.handle}
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {t('people.sharedGroups', { count: person.shared_group_count })}
          </span>
        </div>
      </div>
      <Link
        to={`/p/${person.id}`}
        className="mono-meta"
        style={{ color: 'var(--accent)', textDecoration: 'none' }}
      >
        {t('people.openList')}
      </Link>
    </li>
  );
}

// ─────────────────────────── empty / avatar ───────────────────────────

function EmptyState() {
  const { t } = useI18n();
  return (
    <section>
      <p
        className="display-italic"
        style={{ fontSize: 22, color: 'var(--ink-2)', marginBottom: 'var(--s-2)' }}
      >
        {t('people.empty')}
      </p>
      <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('people.emptyBody')}</p>
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
