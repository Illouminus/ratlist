/**
 * `<PaperLayout>` — page-level wrapper that handles inner padding +
 * max-width column.
 *
 * Used by:
 *   - authed screens, where the outer chrome (sidebar, bottom bar) is
 *     supplied by `<AppLayout>`. PaperLayout just centres + pads the
 *     content.
 *   - pre-auth screens (login, onboarding, invite accept) where it's
 *     the only wrapper — passes `narrow` for a tighter column.
 *
 * Responsive padding via the `--page-pad-*` CSS variables (clamp-based);
 * the wrapper doesn't fight the responsive scale set in tokens.css.
 */
import type { CSSProperties, ReactNode } from 'react';

interface PaperLayoutProps {
  children: ReactNode;
  /** Override the max content width — defaults to var(--content-max). */
  maxWidth?: number | string;
  /** Visually distinguish narrow auth-style screens from full app screens. */
  narrow?: boolean;
  style?: CSSProperties;
}

export function PaperLayout({ children, maxWidth, narrow = false, style }: PaperLayoutProps) {
  const computedMax = maxWidth ?? (narrow ? 460 : 'var(--content-max)');

  return (
    <div
      style={{
        padding: 'var(--page-pad-y) var(--page-pad-x)',
        ...style,
      }}
    >
      <div style={{ maxWidth: computedMax, margin: '0 auto' }}>{children}</div>
    </div>
  );
}
