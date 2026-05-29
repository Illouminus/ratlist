/**
 * `<Button>` — editorial button. Three visual variants, all minimal.
 *
 *   primary  filled rectangle in the accent color, uppercase label
 *   dark     filled rectangle in ink (used when the accent would clash)
 *   ghost    transparent, uppercase, used for "cancel" / "skip"
 *
 * Always pass `type` explicitly — TS strict catches missing forms.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'dark' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const BASE_STYLE = {
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  padding: '10px 22px',
  borderRadius: 'var(--r-1)',
  border: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
  transition: 'opacity var(--motion-fast) ease-out, transform var(--motion-fast) ease-out',
};

function variantStyle(variant: Variant, disabled: boolean): React.CSSProperties {
  if (disabled) {
    return { ...BASE_STYLE, background: 'var(--paper-edge)', color: 'var(--ink-3)', cursor: 'default' };
  }
  switch (variant) {
    case 'primary':
      return { ...BASE_STYLE, background: 'var(--accent)', color: '#fff' };
    case 'dark':
      return { ...BASE_STYLE, background: 'var(--ink)', color: 'var(--paper)' };
    case 'ghost':
      return {
        ...BASE_STYLE,
        background: 'transparent',
        color: 'var(--ink-3)',
        padding: 0,
      };
  }
}

export function Button({
  variant = 'primary',
  type = 'button',
  disabled,
  style,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={['btn', className].filter(Boolean).join(' ')}
      style={{ ...variantStyle(variant, Boolean(disabled)), ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}
