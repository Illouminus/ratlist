/**
 * `<Field>` — label-above-input wrapper. Uses the small uppercase eyebrow
 * label style for consistency across forms.
 */
import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  /** Optional helper text shown below the input. */
  hint?: string;
  /** Error text — replaces the hint and tints input borders on `<SketchInput invalid>`. */
  error?: string | null;
  children: ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <div style={{ marginBottom: 'var(--s-5)' }}>
      <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
        {label}
      </div>
      {children}
      {(error || hint) && (
        <div
          style={{
            marginTop: 'var(--s-2)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: error ? 'var(--accent-deep)' : 'var(--ink-3)',
          }}
        >
          {error ?? hint}
        </div>
      )}
    </div>
  );
}
