/**
 * `<SortableItemRow>` — wraps a single list row in `useSortable` so it can
 * be picked up and dropped into a different priority section.
 *
 * Activator surface: the entire outer row. Long-press anywhere on the card
 * (touch) or click-drag (pointer) activates DnD via the spread `listeners`
 * + `attributes`. A small ⋮⋮ glyph stays on the right edge as a decorative
 * affordance — non-interactive, `aria-hidden`, just a visual hint that the
 * row is draggable.
 *
 * Why the whole row, not the handle: the children typically wrap a `<Link>`
 * to the item detail page. On iOS Safari, long-press over a `<Link>`
 * triggers the native link-preview / context-menu gesture before dnd-kit's
 * TouchSensor (delay 250ms) can fire. We suppress that with
 * `-webkit-touch-callout: none` and `user-select: none` on the outer
 * wrapper. Short tap still navigates (Link's `pointerup` fires before the
 * 250ms hold elapses); long-press triggers drag.
 *
 * While dragging:
 *   - The outer wrapper has `touch-action: none` (prevents scroll-while-drag)
 *   - The children wrapper has `pointer-events: none` (suppresses the
 *     inner `<Link>` click on drop)
 *   - The row gets a soft opacity dim — DragOverlay (mounted by ItemList)
 *     renders a floating ghost following the pointer.
 *
 * Keyboard a11y: the spread `attributes` make the outer div a focusable
 * `role="button"` with the right ARIA properties. Tab to focus, Space to
 * grab, ↑/↓ to move between sections (per dnd-kit's KeyboardSensor +
 * sortableKeyboardCoordinates), Space to drop, Esc to cancel.
 */
import { type ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useI18n } from '../../i18n/useI18n';

export interface SortableItemRowProps {
  /** Stable unique ID for the sortable system — typically `item.id`. */
  id: string;
  /** Row content (photo, body, etc.) rendered as-is. */
  children: ReactNode;
}

export function SortableItemRow({ id, children }: SortableItemRowProps) {
  const { t } = useI18n();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      aria-label={t('priority.a11yHandle')}
      {...attributes}
      {...listeners}
      style={{
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        // While dragging, block browser scroll on the gesture. Idle, allow
        // taps and scrolls (manipulation = no 300ms iOS tap delay).
        touchAction: isDragging ? 'none' : 'manipulation',
        // Suppress iOS Safari's long-press link-preview / context menu so
        // dnd-kit's TouchSensor (delay 250ms) wins the gesture against the
        // inner <Link>. Without these, iOS opens a "preview Link" pop-up
        // halfway through the hold and the drag never activates.
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        cursor: 'grab',
      }}
    >
      <div
        style={{
          // Block clicks from reaching the inner <Link> while a drag is in
          // progress so releasing on the same row doesn't navigate to item
          // detail.
          pointerEvents: isDragging ? 'none' : 'auto',
        }}
      >
        {children}
      </div>
      {/* Decorative drag affordance — kept as a visual cue that the row is
          draggable. Non-interactive (`aria-hidden`, `pointer-events: none`,
          no event handlers) so it doesn't intercept touches that should go
          to the outer wrapper. */}
      <span
        aria-hidden
        data-testid="drag-handle"
        style={{
          position: 'absolute',
          top: '50%',
          right: 'var(--s-2)',
          transform: 'translateY(-50%)',
          color: 'var(--ink-3)',
          fontSize: 14,
          lineHeight: 1,
          opacity: 0.6,
          pointerEvents: 'none',
        }}
      >
        ⋮⋮
      </span>
    </div>
  );
}
