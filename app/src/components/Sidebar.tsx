/**
 * `<Sidebar>` — left rail used by `<AppLayout>` on viewports ≥ 768px.
 *
 * Holds the wordmark up top, the three primary nav targets (My list /
 * Events / People), and the signed-in user's profile + sign-out pinned
 * to the bottom. Hidden on mobile via CSS (see global.css).
 *
 * Secret Santa is intentionally NOT a primary tab — it's seasonal and
 * off the core loop, so it's reached from a secondary entry on the
 * Events screen instead (see EventsScreen).
 */
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useProfile } from '../auth/useProfile';
import { useI18n } from '../i18n/useI18n';
import { LangToggle } from './LangToggle';
import { Wordmark } from './Wordmark';

const NAV = [
  { to: '/', key: 'nav.myList' },
  { to: '/events', key: 'nav.events' },
  { to: '/people', key: 'nav.people' },
] as const;

export function Sidebar() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const { query } = useProfile();
  const displayName = query.status === 'ready' ? query.profile.display_name : '';
  const initial = displayName.charAt(0).toUpperCase() || '?';

  return (
    <aside className="app-sidebar">
      <Wordmark
        size="md"
        style={{ marginBottom: 'var(--s-7)', padding: '0 var(--s-3)' }}
      />

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(({ to, key }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className="mono-meta"
            style={({ isActive }) => ({
              padding: '8px var(--s-3)',
              textDecoration: 'none',
              borderRadius: 'var(--r-2)',
              background: isActive ? 'var(--accent-soft)' : 'transparent',
              color: isActive ? 'var(--ink)' : 'var(--ink-2)',
              fontWeight: isActive ? 600 : 500,
            })}
          >
            {t(key)}
          </NavLink>
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: 'var(--s-4) 0' }} />

      {/* Profile chip — links to /settings. The avatar (or initial)
          plus the display name is the closest thing we have to a
          settings affordance on desktop, so making the whole row
          clickable saves the user from hunting for a gear icon. */}
      <Link
        to="/settings"
        style={{
          padding: '0 var(--s-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-3)',
          marginBottom: 'var(--s-4)',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        {query.status === 'ready' && query.profile.avatar_url ? (
          <img
            src={query.profile.avatar_url}
            alt=""
            width={32}
            height={32}
            style={{
              width: 32,
              height: 32,
              flexShrink: 0,
              borderRadius: '50%',
              objectFit: 'cover',
              boxShadow: 'inset 0 0 0 1px var(--hair-strong)',
            }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              width: 32,
              height: 32,
              flexShrink: 0,
              borderRadius: '50%',
              background: 'var(--accent-wash)',
              color: 'var(--ink)',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: 14,
              boxShadow: 'inset 0 0 0 1px var(--hair-strong)',
            }}
          >
            {initial}
          </span>
        )}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayName}
        </div>
      </Link>

      {/* Two pill buttons sharing the same chrome so they line up
          visually instead of competing — LangToggle on the left
          (changes view), sign-out on the right (leaves the app). */}
      <div
        style={{
          padding: '0 var(--s-3)',
          display: 'flex',
          alignItems: 'stretch',
          gap: 'var(--s-2)',
        }}
      >
        <LangToggle />
        <button
          type="button"
          onClick={() => void signOut()}
          className="mono-meta"
          style={{
            background: 'transparent',
            border: '1px solid var(--hair-strong)',
            padding: '4px 10px',
            borderRadius: 'var(--r-2)',
            cursor: 'pointer',
            color: 'var(--ink-2)',
            marginLeft: 'auto',
          }}
        >
          {t('auth.signOut')}
        </button>
      </div>
    </aside>
  );
}
