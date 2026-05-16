/**
 * `<MobileTopBar>` — compact strip at the top of the viewport on mobile
 * (< 768px). Holds the wordmark on the left and the lang toggle +
 * sign-out on the right. Hidden on desktop via CSS (the sidebar covers
 * the same role).
 */
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useI18n } from '../i18n/useI18n';
import { LangToggle } from './LangToggle';

export function MobileTopBar() {
  const { t } = useI18n();
  const { signOut } = useAuth();

  return (
    <header className="app-mobile-top">
      <Link
        to="/"
        style={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--s-2)',
        }}
      >
        <span
          className="display-italic"
          style={{ fontSize: 22, lineHeight: 1, letterSpacing: -0.5 }}
        >
          {t('app.name')}
        </span>
        <span
          className="marginalia"
          style={{ fontSize: 14, color: 'var(--accent)', transform: 'rotate(-3deg)' }}
        >
          — '26
        </span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
        <LangToggle />
        <button
          type="button"
          onClick={() => void signOut()}
          className="mono-meta"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 6px',
            color: 'var(--ink-3)',
          }}
        >
          {t('auth.signOut')}
        </button>
      </div>
    </header>
  );
}
