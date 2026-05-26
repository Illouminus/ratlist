/**
 * `<PrioritySectionHeader>` — the editorial-style section title above each
 * priority bucket in a sectioned item list. Layout:
 *
 *   ••• Очень хочу  — 3
 *   ─ ─ ─ ─ ─ ─ ─ ─
 *
 * Dots reuse the existing `<PriorityDots>` component so the visual language
 * stays in sync. Count is rendered in Caveat (marginalia font) so it reads
 * as a note rather than a counter.
 */
import { useI18n } from '../i18n/useI18n';
import { PriorityDots } from './PriorityDots';
import type { PriorityLevel } from '../items/groupByPriority';

const LABEL_KEYS: Record<PriorityLevel, string> = {
  1: 'priority.sectionHigh',
  2: 'priority.sectionMid',
  3: 'priority.sectionLow',
};

export interface PrioritySectionHeaderProps {
  level: PriorityLevel;
  count: number;
}

export function PrioritySectionHeader({ level, count }: PrioritySectionHeaderProps) {
  const { t } = useI18n();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 'var(--s-3)',
        padding: 'var(--s-4) 0 var(--s-2)',
        borderBottom: '1px dashed var(--hair-strong)',
        marginBottom: 'var(--s-2)',
      }}
    >
      <PriorityDots level={level} />
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.08,
          textTransform: 'uppercase',
          color: 'var(--ink-2)',
        }}
      >
        {t(LABEL_KEYS[level])}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-hand)',
          fontSize: 16,
          fontWeight: 500,
          color: 'var(--ink-3)',
        }}
      >
        — {count}
      </span>
    </div>
  );
}
