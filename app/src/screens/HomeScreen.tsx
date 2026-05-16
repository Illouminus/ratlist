/**
 * `HomeScreen` — placeholder home for authenticated, onboarded users.
 * Real layout (sidebar + my list / friend lists) lands in the next iteration.
 */
import { useAuth } from '../auth/useAuth';
import { useProfile } from '../auth/useProfile';
import { useI18n } from '../i18n/useI18n';
import { PaperLayout } from '../components/PaperLayout';
import { Button } from '../components/Button';
import { LangToggle } from '../components/LangToggle';

export function HomeScreen() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const { query } = useProfile();

  // `RequireAuth` guarantees `query.status === 'ready'` by the time we render.
  // This narrow keeps TypeScript happy and is cheap.
  if (query.status !== 'ready') return null;

  return (
    <PaperLayout>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 'var(--s-6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-3)' }}>
          <h1
            className="display-italic"
            style={{ fontSize: 48, margin: 0, lineHeight: 1.05, letterSpacing: -1.2 }}
          >
            {t('app.name')}
          </h1>
          <span
            className="marginalia"
            style={{ fontSize: 20, color: 'var(--accent)', transform: 'rotate(-3deg)' }}
          >
            — '26
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
          <LangToggle />
          <Button variant="ghost" onClick={() => void signOut()}>
            {t('auth.signOut')}
          </Button>
        </div>
      </header>

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: 'var(--s-5) 0 var(--s-6)' }} />

      <p
        className="display-italic"
        style={{ fontSize: 26, lineHeight: 1.3, margin: 0 }}
      >
        {t('home.welcome', { name: query.profile.display_name })}
      </p>
      <p style={{ color: 'var(--ink-2)', marginTop: 'var(--s-3)', maxWidth: 540, lineHeight: 1.55 }}>
        {t('home.placeholder')}
      </p>
    </PaperLayout>
  );
}
