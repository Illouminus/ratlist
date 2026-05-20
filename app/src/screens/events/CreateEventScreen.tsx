/**
 * `CreateEventScreen` — `/events/new`. Full-screen form for creating a
 * new event. The creator can pick whether the event is for themselves
 * (default) or for someone else (HR-mode). For HR-mode, an autocomplete
 * over shared-circle users is shown, with a free-text fallback for
 * non-users.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { useEvents } from '../../events/useEvents';
import { useGroups } from '../../groups/useGroups';
import { useMyItems, type MyItem } from '../../items/useMyItems';
import { errorMessage } from '../../lib/errors';
import { EVENT_KINDS, type EventKind } from '../../lib/db';
import { PaperLayout } from '../../components/PaperLayout';
import { Field } from '../../components/Field';
import { SketchInput } from '../../components/SketchInput';
import { Button } from '../../components/Button';
import { ItemPhoto } from '../../components/ItemPhoto';
import { useToast } from '../../components/useToast';
import { HonoreeAutocomplete } from './HonoreeAutocomplete';

export function CreateEventScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const { createEvent } = useEvents();
  const { query: groupsQ } = useGroups();
  const { query: itemsQ } = useMyItems();

  const groups = groupsQ.status === 'ready' ? groupsQ.groups : [];
  const items = itemsQ.status === 'ready' ? itemsQ.items : [];

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<EventKind>('birthday');
  const [occursOn, setOccursOn] = useState('');
  const [note, setNote] = useState('');
  const [circleIds, setCircleIds] = useState<Set<string>>(new Set());
  const [itemIds, setItemIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // HR-mode: "for me" vs "for someone else"
  const [forSelf, setForSelf] = useState(true);
  const [selectedHonoreeId, setSelectedHonoreeId] = useState<string | null>(null);
  const [selectedHonoreeDisplayName, setSelectedHonoreeDisplayName] = useState<string | null>(null);
  const [honoreeFreeText, setHonoreeFreeText] = useState('');
  // What the user is currently typing into the autocomplete input
  const [honoreeQuery, setHonoreQuery] = useState('');

  const trimmedTitle = title.trim();
  const honoreeResolved = forSelf || selectedHonoreeId !== null || honoreeFreeText.trim().length > 0;
  const canSubmit = !submitting && trimmedTitle.length > 0 && honoreeResolved;

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!canSubmit) return;

    // Validate honoree selection in HR-mode
    if (!forSelf && selectedHonoreeId === null && !honoreeFreeText.trim()) {
      setError(t('events.honoree.required'));
      return;
    }

    setSubmitting(true);
    setError(null);

    // Build honoree payload
    const honoreePayload = forSelf
      ? {}
      : selectedHonoreeId !== null
        ? { honoree_id: selectedHonoreeId }
        : { honoree_id: null, honoree_name: honoreeFreeText.trim() };

    const result = await createEvent({
      title: trimmedTitle,
      kind,
      occurs_on: occursOn || null,
      note: note.trim() || null,
      circle_ids: Array.from(circleIds),
      item_ids: Array.from(itemIds),
      ...honoreePayload,
    });

    setSubmitting(false);

    if ('error' in result) {
      setError(errorMessage(t, result.error));
      return;
    }

    toast.show(t('events.createdToast'));
    navigate(`/events/${result.event.id}`, { replace: true });
  }

  function toggleCircle(id: string) {
    setCircleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
        {/* ── For me / for someone else toggle ── */}
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend
            className="mono-meta"
            style={{ marginBottom: 'var(--s-2)', color: 'var(--ink-3)' }}
          >
            {t('events.honoree.label')}
          </legend>
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            <Chip
              active={forSelf}
              onClick={() => {
                setForSelf(true);
                setSelectedHonoreeId(null);
                setSelectedHonoreeDisplayName(null);
                setHonoreeFreeText('');
                setHonoreQuery('');
              }}
              label={t('events.honoree.forMe')}
            />
            <Chip
              active={!forSelf}
              onClick={() => {
                setForSelf(false);
              }}
              label={t('events.honoree.forSomeoneElse')}
            />
          </div>

          {!forSelf && (
            <div style={{ marginTop: 'var(--s-3)' }}>
              {/* Show selected honoree pill */}
              {(selectedHonoreeId !== null || honoreeFreeText) ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--s-2)',
                    padding: '6px 0',
                    borderBottom: '1px solid var(--hair-strong)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 15,
                      color: 'var(--ink)',
                    }}
                  >
                    {selectedHonoreeDisplayName ?? honoreeFreeText}
                  </span>
                  {/* Non-user note */}
                  {selectedHonoreeId === null && honoreeFreeText && (
                    <span
                      className="marginalia"
                      style={{ fontSize: 13, color: 'var(--ink-3)' }}
                    >
                      {t('events.honoree.nonUserNote', { name: honoreeFreeText })}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedHonoreeId(null);
                      setSelectedHonoreeDisplayName(null);
                      setHonoreeFreeText('');
                      setHonoreQuery('');
                    }}
                    aria-label={t('common.cancel')}
                    style={{
                      marginLeft: 'auto',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      color: 'var(--ink-3)',
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                /* Autocomplete input */
                <div style={{ position: 'relative' }}>
                  <SketchInput
                    type="text"
                    value={honoreeQuery}
                    placeholder={t('events.honoree.placeholder')}
                    onChange={(e) => setHonoreQuery(e.target.value)}
                    autoFocus
                  />
                  <HonoreeAutocomplete
                    query={honoreeQuery}
                    onSelectUser={(id, displayName) => {
                      setSelectedHonoreeId(id);
                      setSelectedHonoreeDisplayName(displayName);
                      setHonoreeFreeText('');
                      setHonoreQuery('');
                    }}
                    onSelectFreeText={(name) => {
                      setHonoreeFreeText(name);
                      setSelectedHonoreeId(null);
                      setSelectedHonoreeDisplayName(null);
                      setHonoreQuery('');
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </fieldset>

        <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '0' }} />

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

        <fieldset
          style={{
            border: 'none',
            margin: 0,
            padding: 0,
          }}
        >
          <legend
            className="mono-meta"
            style={{ marginBottom: 'var(--s-2)', color: 'var(--ink-3)' }}
          >
            {t('events.field.audience')}
          </legend>
          {groups.length === 0 ? (
            <p style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: 14 }}>
              {t('events.field.audienceNoGroups')}
            </p>
          ) : (
            <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
              {groups.map((g) => {
                const active = circleIds.has(g.id);
                return (
                  <Chip
                    key={g.id}
                    active={active}
                    onClick={() => toggleCircle(g.id)}
                    label={`${g.emoji ? `${g.emoji} ` : ''}${g.name}`}
                  />
                );
              })}
            </div>
          )}
        </fieldset>

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

// ─────────────────────────── chip ───────────────────────────

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '4px 12px',
        borderRadius: 999,
        border: '1px solid var(--hair-strong)',
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--ink)' : 'var(--ink-2)',
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        boxShadow: active ? 'inset 0 0 0 1px var(--accent)' : 'none',
      }}
    >
      {label}
    </button>
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
