/**
 * `CreateEventScreen` — `/events/new`. Full-screen form for creating a
 * new event in the link-first model. Pick title, kind, date, optional
 * note, and items from your existing wishlist. On success, navigate to
 * `/events/:id?share=1` so the detail screen surfaces a one-time
 * celebratory share card with the public link.
 *
 * Audience (circles) is intentionally absent: the link-first redesign
 * drops the audience-first model entirely. Sharing happens by sending
 * `share_token` to whoever you want to invite — no upfront circle
 * selection.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { useEvents } from '../../events/useEvents';
import { useMyItems, type MyItem } from '../../items/useMyItems';
import { errorMessage } from '../../lib/errors';
import { EVENT_KINDS, type EventKind } from '../../lib/db';
import { PaperLayout } from '../../components/PaperLayout';
import { Field } from '../../components/Field';
import { SketchInput } from '../../components/SketchInput';
import { Button } from '../../components/Button';
import { ItemPhoto } from '../../components/ItemPhoto';
import { useToast } from '../../components/useToast';

export function CreateEventScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const { createEvent } = useEvents();
  const { query: itemsQ } = useMyItems();

  const items = itemsQ.status === 'ready' ? itemsQ.items : [];

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<EventKind>('birthday');
  const [occursOn, setOccursOn] = useState('');
  const [note, setNote] = useState('');
  const [itemIds, setItemIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedTitle = title.trim();
  const canSubmit = !submitting && trimmedTitle.length > 0;

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    const result = await createEvent({
      title: trimmedTitle,
      kind,
      occurs_on: occursOn || null,
      note: note.trim() || null,
      item_ids: Array.from(itemIds),
    });

    setSubmitting(false);

    if ('error' in result) {
      setError(errorMessage(t, result.error));
      return;
    }

    toast.show(t('events.createdToast'));
    // ?share=1 makes EventDetailScreen render the post-create share card.
    navigate(`/events/${result.event.id}?share=1`, { replace: true });
  }

  function toggleItem(id: string) {
    setItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <PaperLayout>
      <header style={{ marginBottom: 'var(--s-5)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
          {t('events.newEyebrow')}
        </div>
        <h2
          className="display-italic"
          style={{
            fontSize: 'var(--display-l)',
            margin: 0,
            lineHeight: 1.05,
            letterSpacing: -1,
          }}
        >
          {t('events.newTitle')}
        </h2>
        <p
          className="marginalia"
          style={{
            marginTop: 'var(--s-2)',
            fontSize: 17,
            color: 'var(--accent)',
            transform: 'rotate(-1.5deg)',
            display: 'inline-block',
          }}
        >
          {t('events.newSub')}
        </p>
      </header>

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '0 0 var(--s-5)' }} />

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}
      >
        <Field label={t('events.field.title')}>
          <SketchInput
            type="text"
            value={title}
            placeholder={t('events.field.titlePh')}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
          />
        </Field>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--s-5)',
          }}
        >
          <Field label={t('events.field.kind')}>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as EventKind)}
              style={{
                width: '100%',
                padding: '8px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--hair-strong)',
                fontFamily: 'var(--font-body)',
                fontSize: 15,
                color: 'var(--ink)',
                outline: 'none',
              }}
            >
              {EVENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`events.kind.${k}`)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('events.field.date')}>
            <SketchInput
              type="date"
              value={occursOn}
              onChange={(e) => setOccursOn(e.target.value)}
            />
          </Field>
        </div>

        <Field label={t('events.field.note')}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('events.field.notePh')}
            rows={2}
            style={{
              width: '100%',
              padding: '8px 0',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--hair-strong)',
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              color: 'var(--ink)',
              outline: 'none',
              resize: 'vertical',
              lineHeight: 1.5,
            }}
          />
        </Field>

        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend
            className="mono-meta"
            style={{ marginBottom: 'var(--s-2)', color: 'var(--ink-3)' }}
          >
            {t('events.field.items', { count: String(itemIds.size) })}
          </legend>
          <ItemPickerGrid
            items={items}
            selected={itemIds}
            onToggle={toggleItem}
            loading={itemsQ.status === 'loading'}
          />
        </fieldset>

        {error && (
          <p style={{ color: 'var(--accent-deep)', fontSize: 13 }}>{error}</p>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--s-3)',
            paddingTop: 'var(--s-3)',
          }}
        >
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
            {t('events.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {submitting ? t('events.creating') : t('events.create')}
          </Button>
        </div>
      </form>
    </PaperLayout>
  );
}

// ─────────────────────────── item picker ───────────────────────────

interface ItemPickerGridProps {
  items: MyItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  loading: boolean;
}

function ItemPickerGrid({ items, selected, onToggle, loading }: ItemPickerGridProps) {
  const { t } = useI18n();
  const sorted = useMemo(
    () => [...items].filter((it) => it.status === 'active'),
    [items],
  );

  if (loading) {
    return (
      <p className="mono-meta" style={{ color: 'var(--ink-3)' }}>
        {t('events.field.itemsLoading')}
      </p>
    );
  }
  if (sorted.length === 0) {
    return (
      <p style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: 14 }}>
        {t('events.field.itemsEmpty')}
      </p>
    );
  }

  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 'var(--s-4)',
      }}
    >
      {sorted.map((it) => {
        const active = selected.has(it.id);
        return (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => onToggle(it.id)}
              aria-pressed={active}
              style={{
                width: '100%',
                padding: 0,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  outline: active ? '2px solid var(--accent)' : 'none',
                  outlineOffset: 2,
                }}
              >
                <ItemPhoto coverUrl={it.cover_url} aspectRatio="4 / 3" alt={it.title} />
                {active && (
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      color: 'var(--paper)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </div>
                )}
              </div>
              <div
                style={{
                  paddingTop: 'var(--s-2)',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  fontSize: 14,
                  color: 'var(--ink)',
                  lineHeight: 1.3,
                }}
              >
                {it.title}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
