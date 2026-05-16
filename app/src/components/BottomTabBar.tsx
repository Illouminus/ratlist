/**
 * `<BottomTabBar>` — fixed-position tab bar at the bottom of the
 * viewport on mobile (< 768px). Four tabs: My list / Circles / People /
 * Santa. Active tab is decided by URL prefix so sub-routes like
 * `/p/:userId` keep "People" active.
 *
 * Hidden on desktop via CSS — the `<Sidebar>` covers the same role.
 */
import { Link, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n/useI18n';

interface Tab {
  to: string;
  /** URL prefixes that should keep this tab active (in addition to `to`). */
  match: (pathname: string) => boolean;
  labelKey: string;
}

const TABS: Tab[] = [
  { to: '/', match: (p) => p === '/', labelKey: 'nav.myList' },
  { to: '/groups', match: (p) => p === '/groups' || p.startsWith('/groups/'), labelKey: 'nav.groups' },
  { to: '/people', match: (p) => p === '/people' || p.startsWith('/p/'), labelKey: 'nav.people' },
  { to: '/santa', match: (p) => p === '/santa' || p.startsWith('/santa/'), labelKey: 'nav.santa' },
];

export function BottomTabBar() {
  const { t } = useI18n();
  const { pathname } = useLocation();

  return (
    <nav className="app-bottom-bar" aria-label="primary navigation">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className="mono-meta"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 6px',
              gap: 4,
              textDecoration: 'none',
              color: active ? 'var(--ink)' : 'var(--ink-3)',
              fontWeight: active ? 600 : 500,
              borderTop: active ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'color var(--motion-fast)',
            }}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
