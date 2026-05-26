/**
 * `<SortableItemRow>` — wraps a single list row in `useSortable` so it can
 * be picked up and dropped into a different priority section. The row's
 * visual is whatever the caller renders as children — we only attach the
 * sortable behavior and the keyboard-accessible drag handle.
 *
 * The handle (⋮⋮) sits absolutely-positioned to the right of the row so
 * the row's existing layout doesn't need to know about it. It's
 * keyboard-focusable (tabIndex 0); pressing Space on it grabs the row.
 *
 * While dragging, the row's children get a soft scale + opacity dim, and
 * link clicks inside are suppressed via `pointer-events: none` so the
 * underlying `<Link>` doesn't navigate when the user releases the drag.
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
      style={{
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        // `touch-action: none` while dragging prevents the browser from
        // hijacking the gesture for scroll. Idle, `manipulation` keeps tap
        // working without the 300ms iOS Safari delay.
        touchAction: isDragging ? 'none' : 'manipulation',
      }}
    >
      <div
        style={{
          // Suppress link clicks inside the row while a drag is in progress
          // so dropping on the same row doesn't navigate to item detail.
          pointerEvents: isDragging ? 'none' : 'auto',
        }}
      >
        {children}
      </div>
      <button
        type="button"
        data-testid="drag-handle"
        aria-label={t('priority.a11yGrabbed', { title: id })}
        {...attributes}
        {...listeners}
        style={{
          position: 'absolute',
          top: '50%',
          right: 'var(--s-2)',
          transform: 'translateY(-50%)',
          width: 24,
          height: 24,
          border: 'none',
          background: 'transparent',
          color: 'var(--ink-3)',
          fontSize: 14,
          lineHeight: 1,
          cursor: 'grab',
          opacity: 0.6,
          padding: 0,
        }}
      >
        ⋮⋮
      </button>
    </div>
  );
}
