/**
 * `<ItemList>` — image-row list of items. Each row is a small photo on
 * the left and a stacked title + maker + note + occasion on the right.
 *
 * The whole row is a `<Link>` to `/i/:itemId` — that's where edit /
 * delete / share live (matches the v2 design, which has no inline
 * actions on the list rows).
 *
 * Layout works the same on mobile and desktop (the row is naturally
 * compact). On desktop it reads more like an editorial inventory than
 * the wide grid; on mobile it replaces the grid entirely.
 *
 * ## Modes
 * - `'flat'` (default): today's behavior — items rendered in a single
 *   undecorated list, no section headers.
 * - `'sectioned'`: items grouped into 3 priority sections with
 *   `<PrioritySectionHeader>` per group. Empty sections are hidden.
 *   Read-only; no drag handles.
 * - `'sectioned-dnd'`: same grouping but all 3 headers are always
 *   visible (empty sections show a drop-zone placeholder). Each row is
 *   wrapped in `<SortableItemRow>`. A `<DndContext>` with three sensors
 *   is mounted at this level; dropping fires `onPriorityChange(itemId,
 *   newLevel)`.
 *
 * Sensor stack (per dnd-kit v6 canon — separate sensors per input type):
 *
 *   - `MouseSensor` with `distance: 5` — desktop click-drag. Mouse only;
 *     does not pick up touch events.
 *   - `TouchSensor` with `delay: 250, tolerance: 5` — long-press on
 *     mobile. Touch only. The delay is critical: it lets the browser
 *     handle scroll natively when the finger starts moving immediately,
 *     and only commits to a drag when the user holds still for 250ms.
 *     **Do not replace this with PointerSensor + distance** — that would
 *     activate drag on ANY 5px finger movement, hijacking scroll.
 *   - `KeyboardSensor` — Tab → Space → arrows → Space.
 *
 * The PointerSensor (unified mouse + touch) would simplify the imports
 * but cannot satisfy both "scroll-friendly touch" AND "fast desktop
 * drag" with a single activation constraint. v8 of dnd-kit ships a
 * pointerType-aware `activationConstraints` function for PointerSensor —
 * not available in our v6 install. So we stay on the per-input-type
 * sensor stack.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type DragStartEvent,
  type DragEndEvent,
  type Over,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { useI18n } from '../../i18n/useI18n';
import type { MyItem } from '../../items/useMyItems';
import { groupByPriority, type PriorityLevel } from '../../items/groupByPriority';
import { PrioritySectionHeader } from '../../components/PrioritySectionHeader';
import { SortableItemRow } from './SortableItemRow';
import { ItemPhoto } from '../../components/ItemPhoto';
import { OccasionTag } from '../../components/OccasionTag';
import { PriorityDots } from '../../components/PriorityDots';
import type { Occasion } from '../../lib/db';

// ─────────────────────────── public API ───────────────────────────

export type ItemListMode = 'flat' | 'sectioned' | 'sectioned-dnd';

export interface ItemListProps {
  items: MyItem[];
  mode?: ItemListMode;
  /** Required when mode='sectioned-dnd'. Called with (itemId, newLevel) on drop. */
  onPriorityChange?: (itemId: string, level: PriorityLevel) => void;
}

export function ItemList({ items, mode = 'flat', onPriorityChange }: ItemListProps) {
  if (mode === 'flat') return <FlatList items={items} />;
  if (mode === 'sectioned') return <SectionedListReadOnly items={items} />;
  return <SectionedListEditable items={items} onPriorityChange={onPriorityChange} />;
}

// ─────────────────────────── flat list ───────────────────────────

function FlatList({ items }: { items: MyItem[] }) {
  return (
    <div>
      {items.map((item, i) => (
        <ItemRow key={item.id} item={item} index={i} last={i === items.length - 1} />
      ))}
    </div>
  );
}

// ─────────────────────────── sectioned read-only ───────────────────────────

function SectionedListReadOnly({ items }: { items: MyItem[] }) {
  const sections = groupByPriority(items);
  // Running index so the number badge in each row stays globally sequential.
  let rowIndex = 0;
  return (
    <div>
      {sections.map((section) => {
        if (section.items.length === 0) return null;
        return (
          <section key={section.level}>
            <PrioritySectionHeader level={section.level} count={section.items.length} />
            {section.items.map((item) => {
              const idx = rowIndex++;
              return (
                <ItemRow
                  key={item.id}
                  item={item}
                  index={idx}
                  last={false}
                />
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

// ─────────────────────────── sectioned + drag-and-drop ───────────────────────────

interface SectionedEditableProps {
  items: MyItem[];
  onPriorityChange?: (itemId: string, level: PriorityLevel) => void;
}

function SectionedListEditable({ items, onPriorityChange }: SectionedEditableProps) {
  const { t } = useI18n();

  // useSensors always called at top of this component — no conditional hook issue.
  // Per dnd-kit v6 canon: separate sensors per input type. Critically, do NOT
  // use PointerSensor with `distance` — it catches touch events too and would
  // activate drag on the first 5px of a scroll gesture, hijacking the page
  // scroll. MouseSensor handles mouse only; TouchSensor handles touch with a
  // hold-delay that lets short flicks scroll the list naturally.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sections = groupByPriority(items);

  // Track the active dragged item ID so DragOverlay can render a ghost.
  const [activeId, setActiveId] = useState<string | null>(null);

  function handleDragStart(event: DragStartEvent): void {
    setActiveId(String(event.active.id));
  }

  function handleDragCancel(): void {
    setActiveId(null);
  }

  function handleDragEnd(event: DragEndEvent): void {
    setActiveId(null);

    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    let newLevel: PriorityLevel | null = null;

    if (overId.startsWith('section-')) {
      // Dropped onto an empty-section drop zone — extract the level from the ID.
      const lvl = Number(overId.slice('section-'.length));
      newLevel = lvl === 1 ? 1 : lvl === 3 ? 3 : 2;
    } else {
      // Dropped onto another item row — adopt that item's priority section.
      const targetItem = items.find((i) => i.id === overId);
      if (targetItem) {
        newLevel = targetItem.priority === 1 || targetItem.priority === 3
          ? targetItem.priority
          : 2;
      }
    }

    if (newLevel === null) return;

    // Bail out if the item is already in the target section (no-op).
    const activeItem = items.find((i) => i.id === String(active.id));
    if (!activeItem) return;
    const currentLevel: PriorityLevel =
      activeItem.priority === 1 || activeItem.priority === 3
        ? activeItem.priority
        : 2;
    if (currentLevel === newLevel) return;

    onPriorityChange?.(String(active.id), newLevel);
  }

  // The item being dragged — used to render the DragOverlay ghost.
  const activeItem = activeId !== null ? items.find((i) => i.id === activeId) : null;

  // ── Accessibility announcements ─────────────────────────────────────
  // Translates drag events into screen-reader narration using the
  // priority.a11y* keys.  The helper resolves a priority level to its
  // section label string so we don't repeat the three-way ternary.
  function sectionLabelFor(level: PriorityLevel): string {
    if (level === 1) return t('priority.sectionHigh');
    if (level === 3) return t('priority.sectionLow');
    return t('priority.sectionMid');
  }

  // Given an `over` target (item id or empty-section drop-zone id), try
  // to determine which priority section it belongs to.
  function levelFromOver(over: Over | null): PriorityLevel | undefined {
    if (!over) return undefined;
    const overId = String(over.id);
    if (overId.startsWith('section-')) {
      const n = Number(overId.slice('section-'.length));
      return n === 1 ? 1 : n === 3 ? 3 : 2;
    }
    const target = items.find((i) => i.id === overId);
    if (target) return (target.priority === 1 || target.priority === 3 ? target.priority : 2);
    return undefined;
  }

  const announcements: Announcements = {
    onDragStart({ active }: { active: Active }) {
      const item = items.find((i) => i.id === String(active.id));
      return t('priority.a11yGrabbed', { title: item?.title ?? String(active.id) });
    },
    onDragOver({ over }: { active: Active; over: Over | null }) {
      const lvl = levelFromOver(over);
      if (lvl === undefined) return undefined;
      return t('priority.a11yMovedTo', { section: sectionLabelFor(lvl) });
    },
    onDragEnd({ over }: { active: Active; over: Over | null }) {
      const lvl = levelFromOver(over);
      if (lvl === undefined) return t('priority.a11yCanceled');
      return t('priority.a11yDropped', { section: sectionLabelFor(lvl) });
    },
    onDragCancel() {
      return t('priority.a11yCanceled');
    },
  };

  // Running index for globally sequential number badges.
  let rowIndex = 0;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      accessibility={{ announcements }}
    >
      {sections.map((section) => (
        <section key={section.level}>
          <PrioritySectionHeader level={section.level} count={section.items.length} />
          <SortableContext
            items={
              section.items.length > 0
                ? section.items.map((i) => i.id)
                : [`section-${section.level}`]
            }
            strategy={verticalListSortingStrategy}
          >
            {section.items.length === 0 ? (
              <EmptySectionDropZone
                level={section.level}
                placeholder={t('priority.sectionEmptyHint')}
              />
            ) : (
              section.items.map((item) => {
                const idx = rowIndex++;
                return (
                  <SortableItemRow key={item.id} id={item.id}>
                    <ItemRow item={item} index={idx} last={false} />
                  </SortableItemRow>
                );
              })
            )}
          </SortableContext>
        </section>
      ))}
      {/* DragOverlay must be a direct child of DndContext (not inside a
          SortableContext) so the floating ghost follows the cursor across
          all three sections. The source row fades to 0.6 opacity via
          SortableItemRow; this overlay renders a fully-opaque lifted copy. */}
      <DragOverlay>
        {activeItem != null ? (
          <div
            style={{
              boxShadow: '0 8px 20px rgba(43, 38, 32, 0.18)',
              background: 'var(--paper)',
              cursor: 'grabbing',
            }}
          >
            <ItemRow item={activeItem} index={0} last={true} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ─────────────────────────── empty drop zone ───────────────────────────

function EmptySectionDropZone({
  level,
  placeholder,
}: {
  level: PriorityLevel;
  placeholder: string;
}) {
  const { setNodeRef, isOver } = useSortable({ id: `section-${level}` });
  return (
    <div
      ref={setNodeRef}
      style={{
        padding: 'var(--s-3) var(--s-2)',
        fontFamily: 'var(--font-hand)',
        fontSize: 14,
        fontStyle: 'italic',
        color: 'var(--ink-3)',
        background: isOver ? 'var(--accent-soft)' : 'transparent',
        border: isOver ? '1px dashed var(--accent)' : '1px dashed transparent',
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
    >
      {placeholder}
    </div>
  );
}

// ─────────────────────────── row ───────────────────────────

interface ItemRowProps {
  item: MyItem;
  index: number;
  last: boolean;
}

/** Multi-line clamp via the line-clamp / -webkit-box trick. Widely
 *  supported (Firefox added support in 2023). Stable in both Chromium
 *  and Safari for years. */
const CLAMP_2_LINES = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
} as const;

/** Total reserved height for a row. Calibrated so a row with a 2-line
 *  title and a 2-line note still fits, AND rows with no note look
 *  airy rather than tiny. Keeps the list visually regular. */
const ROW_MIN_HEIGHT = 124;

function ItemRow({ item, index, last }: ItemRowProps) {
  return (
    <Link
      to={`/i/${item.id}`}
      style={{
        position: 'relative',
        padding: 'var(--s-4) 0',
        borderBottom: last ? 'none' : '1px solid var(--hair)',
        display: 'flex',
        gap: 'var(--s-4)',
        minHeight: ROW_MIN_HEIGHT,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {/* photo + numbered badge */}
      <div style={{ width: 88, flexShrink: 0, position: 'relative' }}>
        <ItemPhoto coverUrl={item.cover_url} aspectRatio="4 / 3" alt={item.title} />
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 11,
            color: 'var(--ink)',
            background: 'rgba(250, 246, 239, 0.85)',
            padding: '0 4px',
            letterSpacing: 0.4,
          }}
          aria-hidden
        >
          {String(index + 1).padStart(2, '0')}
        </div>
      </div>

      {/* content */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 'var(--s-2)',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--ink)',
              lineHeight: 1.25,
              flex: 1,
              minWidth: 0,
              ...CLAMP_2_LINES,
            }}
          >
            {item.title}
          </h3>
          {item.price_text && (
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontWeight: 500,
                fontSize: 16,
                color: 'var(--accent)',
                whiteSpace: 'nowrap',
              }}
            >
              {item.price_text}
            </div>
          )}
        </div>

        {item.maker && (
          <div
            style={{
              marginTop: 2,
              fontSize: 11,
              color: 'var(--ink-3)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {item.maker}
          </div>
        )}

        {item.note && (
          <div
            style={{
              marginTop: 'var(--s-1)',
              fontSize: 12,
              color: 'var(--ink-2)',
              lineHeight: 1.4,
              ...CLAMP_2_LINES,
            }}
          >
            {item.note}
          </div>
        )}

        <div
          style={{
            marginTop: 'auto',
            paddingTop: 'var(--s-2)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-3)',
          }}
        >
          <OccasionTag kind={item.occasion as Occasion} />
          {/* Only render the priority dots for non-default levels —
              otherwise every row would carry a "•• хочу" marker that
              just adds visual noise without saying anything new. */}
          {item.priority !== 2 && (
            <PriorityDots level={item.priority === 1 ? 1 : 3} />
          )}
          {item.group_ids.length === 0 && <PrivateBadge />}
        </div>
      </div>
    </Link>
  );
}

/** Tiny "приват" pill rendered on rows/cards whose item isn't published
 *  into any group — owner-only visibility. Keeps the privacy posture
 *  visible at a glance instead of hiding it on the detail page. */
function PrivateBadge() {
  const { t } = useI18n();
  return (
    <span
      className="mono-meta"
      style={{
        color: 'var(--ink-3)',
        border: '1px solid var(--hair-strong)',
        padding: '1px 6px',
        borderRadius: 'var(--r-2)',
      }}
    >
      {t('list.privateBadge')}
    </span>
  );
}
