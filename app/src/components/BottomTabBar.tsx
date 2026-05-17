/**
 * `<BottomTabBar>` — fixed bottom strip on mobile (< 768px). Four
 * primary destinations grouped two-and-two around a centred FAB-style
 * "+" button. The FAB is a global "add a wish" intent that always
 * routes to `/add` (the full-screen add form).
 *
 * Hidden on desktop via CSS — the `<Sidebar>` covers the same role.
 */
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/useI18n';

interface Tab {
  to: string;
  /** URL prefixes that should keep this tab active. */
  match: (pathname: string) => boolean;
  labelKey: string;
}

// 2 left + FAB + 2 right. Circles live in /settings now — they're
// long-lived plumbing, not a daily destination. Events are the
// honoree-facing primary surface; People is the friend directory.
const LEFT_TABS: Tab[] = [
  { to: '/', match: (p) => p === '/', labelKey: 'nav.myList' },
  { to: '/events', match: (p) => p === '/events' || p.startsWith('/events/'), labelKey: 'nav.events' },
];

const RIGHT_TABS: Tab[] = [
  { to: '/people', match: (p) => p === '/people' || p.startsWith('/p/'), labelKey: 'nav.people' },
  { to: '/santa', match: (p) => p === '/santa' || p.startsWith('/santa/'), labelKey: 'nav.santa' },
];

export function BottomTabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="app-bottom-bar" aria-label="primary navigation">
      {LEFT_TABS.map((tab) => (
        <TabLink key={tab.to} tab={tab} active={tab.match(pathname)} />
      ))}

      <button
        type="button"
        onClick={() => navigate('/add')}
        aria-label="add a wish"
        style={{
          width: 44,
          height: 44,
          margin: '0 var(--s-3)',
          flexShrink: 0,
          background: 'var(--ink)',
          color: 'var(--paper)',
          border: 'none',
          borderRadius: 'var(--r-1)',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontWeight: 500,
          fontSize: 26,
          lineHeight: 1,
          boxShadow: '0 4px 10px rgba(43, 38, 32, 0.18)',
          alignSelf: 'center',
        }}
      >
        +
      </button>

      {RIGHT_TABS.map((tab) => (
        <TabLink key={tab.to} tab={tab} active={tab.match(pathname)} />
      ))}
    </nav>
  );
}

// ─────────────────────────── tab ───────────────────────────

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  const { t } = useI18n();
  return (
    <Link
      to={tab.to}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--s-2) var(--s-1)',
        gap: 4,
        textDecoration: 'none',
        color: active ? 'var(--ink)' : 'var(--ink-3)',
        fontFamily: 'var(--font-body)',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}
    >
      {t(tab.labelKey)}
      <span
        aria-hidden
        style={{
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: active ? 'var(--accent)' : 'transparent',
        }}
      />
    </Link>
  );
}
