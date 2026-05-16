/**
 * `<SketchInput>` — text input with a single hairline underline, no box.
 * Matches the editorial sketch feel of the design. Used inside `<Field>`.
 *
 * Accepts a `style` override (merged on top of the base styles) — useful
 * for one-off cases like centring the text on a narrow input.
 */
import { forwardRef, type InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const SketchInput = forwardRef<HTMLInputElement, Props>(function SketchInput(
  { invalid = false, style, ...rest },
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
        ...style,
      }}
      {...rest}
    />
  );
});
