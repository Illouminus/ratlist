/**
 * `<TopBar>` — the editorial header strip shared by every authenticated
 * screen. Holds the wordmark on the left and the auth/lang controls on
 * the right. Optional `nav` slot in the middle for in-screen navigation.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useI18n } from '../i18n/useI18n';
import { Button } from './Button';
import { LangToggle } from './LangToggle';

interface TopBarProps {
  /** Optional center slot (e.g. breadcrumb / section nav). */
  nav?: ReactNode;
}

export function TopBar({ nav }: TopBarProps) {
  const { t } = useI18n();
  const { signOut } = useAuth();

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 'var(--s-5)',
        marginBottom: 'var(--s-6)',
        flexWrap: 'wrap',
      }}
    >
      <Link
        to="/"
        style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'baseline', gap: 'var(--s-3)' }}
      >
        <h1
          className="display-italic"
          style={{ fontSize: 36, margin: 0, lineHeight: 1.05, letterSpacing: -1 }}
        >
          {t('app.name')}
        </h1>
        <span
          className="marginalia"
          style={{ fontSize: 18, color: 'var(--accent)', transform: 'rotate(-3deg)' }}
        >
          — '26
        </span>
      </Link>

      {nav && <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>{nav}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
        <LangToggle />
        <Button variant="ghost" onClick={() => void signOut()}>
          {t('auth.signOut')}
        </Button>
      </div>
    </header>
  );
}
