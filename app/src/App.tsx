/**
 * Placeholder App shell for the initial scaffold. Real screens, routing
 * and auth land in the next commit.
 */
import { useI18n } from './i18n/useI18n';

export default function App() {
  const { t, lang, setLang } = useI18n();

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: 'var(--s-8) var(--s-7)',
        maxWidth: 'var(--content-max)',
        margin: '0 auto',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-3)' }}>
          <h1
            className="display-italic"
            style={{ fontSize: 56, margin: 0, lineHeight: 1.05, letterSpacing: -1.5 }}
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

        <button
          type="button"
          onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}
          className="mono-meta"
          style={{
            background: 'transparent',
            border: '1px solid var(--hair-strong)',
            padding: 'var(--s-1) var(--s-3)',
            borderRadius: 'var(--r-2)',
            cursor: 'pointer',
          }}
        >
          {lang === 'ru' ? 'EN' : 'RU'}
        </button>
      </header>

      <p
        className="marginalia"
        style={{ fontSize: 22, marginTop: 'var(--s-3)', color: 'var(--ink-3)' }}
      >
        {t('app.tagline')}
      </p>

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: 'var(--s-6) 0' }} />

      <p style={{ color: 'var(--ink-2)', maxWidth: 540, lineHeight: 1.55 }}>
        Скелет приложения. Следующий шаг — auth и реальные экраны.
      </p>
    </div>
  );
}
