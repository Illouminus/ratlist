/**
 * `<Wordmark>` — the Rat List brand lockup. The app name set in editorial
 * Newsreader italic, trailed by a small terracotta accent dot that echoes
 * `favicon.svg` (an italic "R" with a floating terracotta dot). Optionally
 * keeps the hand-drawn «— 'YY» Caveat marginalia that has ridden alongside
 * the name in the chrome since v0.1.
 *
 * One component, three sizes, used everywhere the brand appears: the desktop
 * sidebar, the mobile top bar, and the two public landings. Links home by
 * default; pass `link={false}` for a plain inline lockup (e.g. when it's
 * already inside another anchor).
 */
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/useI18n';

type Size = 'sm' | 'md' | 'lg';

interface WordmarkProps {
  size?: Size;
  /** Keep the Caveat «— 'YY» marginalia after the name. Default true. */
  year?: boolean;
  /** Wrap in a Link to `/`. Default true. */
  link?: boolean;
  style?: CSSProperties;
}

export function Wordmark({ size = 'md', year = true, link = true, style }: WordmarkProps) {
  const { t } = useI18n();
  const yy = String(new Date().getFullYear()).slice(-2);

  const inner = (
    <>
      <span className="display-italic wordmark-name">
        {t('app.name')}
        <span className="wordmark-dot" aria-hidden="true" />
      </span>
      {year && (
        <span className="marginalia wordmark-year" aria-hidden="true">
          — '{yy}
        </span>
      )}
    </>
  );

  if (!link) {
    return (
      <span className={`wordmark wordmark-${size}`} style={style}>
        {inner}
      </span>
    );
  }

  return (
    <Link
      to="/"
      className={`wordmark wordmark-${size}`}
      style={style}
      aria-label={t('app.name')}
    >
      {inner}
    </Link>
  );
}
