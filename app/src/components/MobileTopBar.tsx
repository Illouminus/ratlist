/**
 * `<MobileTopBar>` — compact strip at the top of the viewport on mobile
 * (< 768px). Holds the wordmark on the left and the lang toggle +
 * sign-out on the right. Hidden on desktop via CSS (the sidebar covers
 * the same role).
 */
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useI18n } from '../i18n/useI18n';
import { Wordmark } from './Wordmark';

export function MobileTopBar() {
  const { t } = useI18n();
  const { signOut } = useAuth();

  return (
    <header className="app-mobile-top">
      <Wordmark size="sm" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
        <Link
          to="/settings"
          className="mono-meta"
          style={{
            padding: '4px 10px',
            border: '1px solid var(--hair-strong)',
            borderRadius: 'var(--r-2)',
            color: 'var(--ink-2)',
            textDecoration: 'none',
          }}
        >
          {t('settings.nav')}
        </Link>
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
          }}
        >
          {t('auth.signOut')}
        </button>
      </div>
    </header>
  );
}
