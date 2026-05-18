/**
 * `<SkipLink>` — visually hidden until focused, jumps keyboard users
 * past the sidebar / bottom-tab chrome to the `#main` landmark.
 *
 * Mounted once at the top of the React tree (`App.tsx`) so it's the
 * first focusable element on every route, including prerendered
 * pages. Styled by `.skip-link` in `styles/global.css`.
 */
import { useI18n } from '../i18n/useI18n';

export function SkipLink() {
  const { t } = useI18n();
  return (
    <a className="skip-link" href="#main">
      {t('a11y.skipToMain')}
    </a>
  );
}
