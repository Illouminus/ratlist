/**
 * `<LangToggle>` — small RU/EN switcher in the corner of a screen.
 * Two languages only, so a single toggle button is enough; if we add more
 * languages later, swap for a dropdown.
 */
import { useI18n } from '../i18n/useI18n';

export function LangToggle() {
  const { lang, setLang } = useI18n();
  const next = lang === 'ru' ? 'en' : 'ru';
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      className="mono-meta"
      aria-label={`switch language to ${next}`}
      style={{
        background: 'transparent',
        border: '1px solid var(--hair-strong)',
        padding: '4px 10px',
        borderRadius: 'var(--r-2)',
        cursor: 'pointer',
        color: 'var(--ink-2)',
      }}
    >
      {next.toUpperCase()}
    </button>
  );
}
