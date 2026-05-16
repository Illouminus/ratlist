/**
 * `<Sidebar>` — left rail used by `<AppLayout>` on viewports ≥ 768px.
 *
 * Holds the wordmark up top, the four primary nav targets (My list /
 * Circles / People / Santa), and the signed-in user's profile + sign-out
 * pinned to the bottom. Hidden on mobile via CSS (see global.css).
 */
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useProfile } from '../auth/useProfile';
import { useI18n } from '../i18n/useI18n';
import { Button } from './Button';
import { LangToggle } from './LangToggle';

const NAV = [
  { to: '/', key: 'nav.myList' },
  { to: '/groups', key: 'nav.groups' },
  { to: '/people', key: 'nav.people' },
  { to: '/santa', key: 'nav.santa' },
] as const;

export function Sidebar() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const { query } = useProfile();
  const displayName = query.status === 'ready' ? query.profile.display_name : '';
  const initial = displayName.charAt(0).toUpperCase() || '?';

  return (
    <aside className="app-sidebar">
      <Link
        to="/"
        style={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--s-3)',
          marginBottom: 'var(--s-7)',
          padding: '0 var(--s-3)',
        }}
      >
        <div
          className="display-italic"
          style={{
            fontSize: 'var(--display-s)',
            lineHeight: 1.05,
            letterSpacing: -0.6,
          }}
        >
          {t('app.name')}
        </div>
        <span
          className="marginalia"
          style={{ fontSize: 16, color: 'var(--accent)', transform: 'rotate(-3deg)' }}
        >
          — '26
        </span>
      </Link>

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

      <div
        style={{
          padding: '0 var(--s-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-3)',
          marginBottom: 'var(--s-3)',
        }}
      >
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
        <div
          style={{
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
      </div>

      <div
        style={{
          padding: '0 var(--s-3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--s-3)',
        }}
      >
        <LangToggle />
        <Button variant="ghost" onClick={() => void signOut()} style={{ fontSize: 11 }}>
          {t('auth.signOut')}
        </Button>
      </div>
    </aside>
  );
}
