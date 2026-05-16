/**
 * `<SketchInput>` — text input with a single hairline underline, no box.
 * Matches the editorial sketch feel of the design. Used inside `<Field>`.
 */
import { forwardRef, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'style'> & {
  invalid?: boolean;
};

export const SketchInput = forwardRef<HTMLInputElement, Props>(function SketchInput(
  { invalid = false, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      style={{
        width: '100%',
        padding: '8px 0',
        background: 'transparent',
        border: 'none',
        borderBottom: `1px solid ${invalid ? 'var(--accent-deep)' : 'var(--hair-strong)'}`,
        fontFamily: 'var(--font-body)',
        fontSize: 15,
        color: 'var(--ink)',
        outline: 'none',
        boxSizing: 'border-box',
      }}
      {...rest}
    />
  );
});
