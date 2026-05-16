/**
 * `<TopBarNav>` — three-section nav slotted into the `<TopBar>` middle:
 * My list / Circles / People. The active link is bold + underlined.
 *
 * Lives next to the wordmark so users always know where they are without
 * needing a sidebar (which we may add later).
 */
import { NavLink } from 'react-router-dom';
import { useI18n } from '../i18n/useI18n';

const ITEMS = [
  { to: '/', key: 'nav.myList' },
  { to: '/groups', key: 'nav.groups' },
  { to: '/people', key: 'nav.people' },
] as const;

export function TopBarNav() {
  const { t } = useI18n();
  return (
    <nav style={{ display: 'flex', gap: 'var(--s-5)' }}>
      {ITEMS.map(({ to, key }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className="mono-meta"
          style={({ isActive }) => ({
            color: isActive ? 'var(--ink)' : 'var(--ink-3)',
            textDecoration: 'none',
            fontWeight: isActive ? 600 : 500,
            borderBottom: isActive ? '1.5px solid var(--ink)' : '1.5px solid transparent',
            paddingBottom: 2,
          })}
        >
          {t(key)}
        </NavLink>
      ))}
    </nav>
  );
}
