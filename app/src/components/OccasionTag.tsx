/**
 * `<OccasionTag>` — small editorial label for "birthday / anytime /
 * holidays / treat". A dot + uppercase letterspaced label. Used both on
 * item cards and in the Add Item form.
 */
import { useI18n } from '../i18n/useI18n';
import { OCCASIONS, type Occasion } from '../lib/db';

interface OccasionTagProps {
  kind: Occasion;
}

export function OccasionTag({ kind }: OccasionTagProps) {
  const { t } = useI18n();
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: 'var(--font-body)',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: 0.06,
        textTransform: 'uppercase',
        color: 'var(--ink-2)',
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: 'var(--ink-2)',
          opacity: 0.7,
        }}
      />
      {t(`occasion.${kind}`)}
    </span>
  );
}

/** Re-export so screens can iterate over all four occasions. */
export { OCCASIONS };
