/**
 * `<PaperLayout>` — page-level wrapper that gives a screen the editorial
 * paper feel: centered content, generous padding, max-width column. Use it
 * once per top-level screen as the outermost element.
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
        minHeight: '100vh',
        padding: 'var(--s-7) var(--s-6)',
        ...style,
      }}
    >
      <div style={{ maxWidth: computedMax, margin: '0 auto' }}>{children}</div>
    </div>
  );
}
