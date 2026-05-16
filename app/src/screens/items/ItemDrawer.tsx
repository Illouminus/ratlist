/**
 * `<ItemDrawer>` — slide-in form for both creating and editing a wishlist
 * item. The same shape backs both flows: in create mode the form starts
 * blank with all of the user's groups pre-selected; in edit mode the form
 * is seeded from the item being edited and `group_ids` reflects its
 * current publication set.
 *
 * Open the drawer in create mode by passing `mode={{ kind: 'create' }}`,
 * in edit mode by passing `mode={{ kind: 'edit', item: MyItem }}`. The
 * parent decides which mutation runs via `onSubmit`.
 *
 * The form is mounted only while the drawer is open, so we use plain
 * `useState` initialisers — closing then re-opening remounts with fresh
 * state derived from the new mode.
 */
import { useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { OCCASIONS, type Occasion } from '../../lib/db';
import type { MyGroup } from '../../groups/useGroups';
import type { CreateItemInput, MyItem } from '../../items/useMyItems';
import { Drawer } from '../../components/Drawer';
import { Field } from '../../components/Field';
import { SketchInput } from '../../components/SketchInput';
import { Button } from '../../components/Button';
import { PhotoField } from './PhotoField';
import { fetchUrlMeta } from '../../items/fetchUrlMeta';
import { errorMessage } from '../../lib/errors';

/** Hard cap on item title length. Mirrors the DB CHECK constraint. */
const MAX_TITLE_LENGTH = 200;
/** Soft cap when auto-filling from a fetched URL. Long page titles
 *  (GitHub repo descriptions, news article H1s) are usually not what you
 *  want as a wishlist item title — truncate for the user. They can
 *  extend up to MAX_TITLE_LENGTH manually if needed. */
const AUTOFILL_TITLE_LENGTH = 100;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

/** Discriminated mode prop — keeps the create vs edit split explicit. */
export type ItemDrawerMode =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; item: MyItem };

interface ItemDrawerProps {
  mode: ItemDrawerMode;
  onClose: () => void;
  groups: MyGroup[];
  /**
   * Save handler — receives the form input and returns either the saved
   * item or an error message. The parent decides whether this is a create
   * or update call based on the `mode` it passed in.
   */
  onSubmit: (input: CreateItemInput) => Promise<{ item: MyItem } | { error: string }>;
}

export function ItemDrawer({ mode, onClose, groups, onSubmit }: ItemDrawerProps) {
  return (
    <Drawer
      open={mode.kind !== 'closed'}
      onClose={onClose}
      ariaLabel={mode.kind === 'edit' ? 'edit item' : 'add item'}
    >
      {mode.kind !== 'closed' && (
        <ItemForm mode={mode} groups={groups} onSubmit={onSubmit} onClose={onClose} />
      )}
    </Drawer>
  );
}

// ─────────────────────────── form ───────────────────────────

interface ItemFormProps {
  mode: Exclude<ItemDrawerMode, { kind: 'closed' }>;
  groups: MyGroup[];
  onSubmit: ItemDrawerProps['onSubmit'];
  onClose: () => void;
}

function ItemForm({ mode, groups, onSubmit, onClose }: ItemFormProps) {
  const { t } = useI18n();
  const isEdit = mode.kind === 'edit';
  const initial = mode.kind === 'edit' ? mode.item : null;

  const [title, setTitle] = useState<string>(initial?.title ?? '');
  const [maker, setMaker] = useState<string>(initial?.maker ?? '');
  const [url, setUrl] = useState<string>(initial?.url ?? '');
  const [priceText, setPriceText] = useState<string>(initial?.price_text ?? '');
  const [occasion, setOccasion] = useState<Occasion>(
    (initial?.occasion as Occasion | undefined) ?? 'anytime',
  );
  const [note, setNote] = useState<string>(initial?.note ?? '');
  const [coverUrl, setCoverUrl] = useState<string | null>(initial?.cover_url ?? null);
  const [metaStatus, setMetaStatus] = useState<MetaFetchStatus>({ kind: 'idle' });
  // In create mode: default-on for all groups. In edit mode: use the
  // item's current publication set.
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(
    () => new Set(initial ? initial.group_ids : groups.map((g) => g.id)),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleGroup(id: string): void {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Pull og: metadata for the current URL via the Edge Function, then
   * fill any *empty* form fields from the result. We never overwrite
   * what the user has already typed — paste link first, then refine.
   */
  async function handleFetchMeta(): Promise<void> {
    const trimmed = url.trim();
    if (trimmed.length === 0) return;
    setMetaStatus({ kind: 'fetching' });

    const result = await fetchUrlMeta(trimmed);
    if (result.kind === 'error') {
      setMetaStatus({ kind: 'error' });
      return;
    }

    const filled: string[] = [];
    const { data } = result;
    if (data.title && title.trim().length === 0) {
      // Truncate aggressively — full page titles are rarely good wish-list
      // item names. User can extend up to MAX_TITLE_LENGTH manually.
      setTitle(truncate(data.title, AUTOFILL_TITLE_LENGTH));
      filled.push('title');
    }
    if (data.site_name && maker.trim().length === 0) {
      setMaker(data.site_name);
      filled.push('maker');
    }
    if (data.image_url && coverUrl === null) {
      setCoverUrl(data.image_url);
      filled.push('photo');
    }
    if (data.price_text && priceText.trim().length === 0) {
      setPriceText(data.price_text);
      filled.push('price');
    }
    if (data.description && note.trim().length === 0) {
      setNote(data.description);
      filled.push('note');
    }

    setMetaStatus(filled.length > 0 ? { kind: 'ok', filled } : { kind: 'empty' });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setError(t('errors.titleRequired'));
      return;
    }
    if (trimmedTitle.length > MAX_TITLE_LENGTH) {
      // Defence in depth: the input has maxLength too, but autofill can
      // bypass that. Catch it before the DB does.
      setError(t('errors.titleTooLong'));
      return;
    }

    setSubmitting(true);
    setError(null);

    const input: CreateItemInput = {
      title: trimmedTitle,
      maker: maker.trim() || null,
      url: url.trim() || null,
      price_text: priceText.trim() || null,
      occasion,
      note: note.trim() || null,
      cover_url: coverUrl,
      group_ids: Array.from(selectedGroups),
    };

    const result = await onSubmit(input);
    if ('error' in result) {
      setError(errorMessage(t, result.error));
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    onClose();
  }

  const headlineTitle = isEdit ? t('add.editTitle') : t('add.title');
  const headlineSub = isEdit ? t('add.editSub') : t('add.sub');
  const submitLabel = isEdit ? t('add.saveChanges') : t('add.save');
  const eyebrow = isEdit ? t('add.editEyebrow') : t('add.eyebrow');

  return (
    <form onSubmit={handleSubmit} noValidate>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 'var(--s-4)',
        }}
      >
        <div className="mono-meta">{eyebrow}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--ink-3)',
            fontSize: 12,
            padding: 4,
          }}
        >
          esc ×
        </button>
      </header>

      <div style={{ marginBottom: 'var(--s-5)' }}>
        <h2
          className="display-italic"
          style={{ margin: 0, fontSize: 32, lineHeight: 1.1, letterSpacing: -0.8 }}
        >
          {headlineTitle}
        </h2>
        <p
          className="marginalia"
          style={{ marginTop: 'var(--s-2)', fontSize: 16, color: 'var(--accent)' }}
        >
          {headlineSub}
        </p>
      </div>

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '0 0 var(--s-4)' }} />

      <PhotoField value={coverUrl} onChange={setCoverUrl} />

      <Field label={t('add.thing')}>
        <SketchInput
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('add.thingPh')}
          autoFocus
          required
          maxLength={200}
        />
      </Field>

      <Field label={t('add.makerLabel')}>
        <SketchInput
          type="text"
          value={maker}
          onChange={(e) => setMaker(e.target.value)}
          placeholder={t('add.makerPh')}
        />
      </Field>

      <Field label={t('add.urlLabel')}>
        <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <SketchInput
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (metaStatus.kind !== 'idle' && metaStatus.kind !== 'fetching') {
                  setMetaStatus({ kind: 'idle' });
                }
              }}
              placeholder={t('add.urlPh')}
            />
          </div>
          <Button
            variant="ghost"
            onClick={() => void handleFetchMeta()}
            disabled={url.trim().length === 0 || metaStatus.kind === 'fetching'}
            style={{ color: 'var(--accent)', padding: '0 0 4px 0', whiteSpace: 'nowrap' }}
          >
            {metaStatus.kind === 'fetching' ? t('add.fetchingMeta') : t('add.fetchMeta')}
          </Button>
        </div>
        <MetaFeedback status={metaStatus} t={t} />
      </Field>

      <Field label={t('add.priceLabel')}>
        <SketchInput
          type="text"
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
          placeholder={t('add.pricePh')}
        />
      </Field>

      <Field label={t('add.occasionLabel')}>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          {OCCASIONS.map((occ) => (
            <OccasionChip
              key={occ}
              kind={occ}
              active={occasion === occ}
              onClick={() => setOccasion(occ)}
            />
          ))}
        </div>
      </Field>

      <Field label={t('add.noteLabel')}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('add.notePh')}
          rows={3}
          style={{
            width: '100%',
            padding: 'var(--s-3)',
            boxSizing: 'border-box',
            background: '#fffdf6',
            border: '1px solid var(--hair-strong)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--ink)',
            resize: 'none',
            outline: 'none',
          }}
        />
      </Field>

      {groups.length > 0 && (
        <Field label={t('add.groupsLabel')} hint={t('add.groupsHint')}>
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            {groups.map((g) => (
              <GroupChip
                key={g.id}
                label={g.name}
                emoji={g.emoji}
                active={selectedGroups.has(g.id)}
                onClick={() => toggleGroup(g.id)}
              />
            ))}
          </div>
        </Field>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 'var(--s-5)',
        }}
      >
        <Button variant="ghost" onClick={onClose}>
          {t('add.cancel')}
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={submitting || title.trim().length === 0}
        >
          {submitting ? t('auth.sending') : submitLabel}
        </Button>
      </div>

      {error && (
        <p style={{ color: 'var(--accent-deep)', fontSize: 13, marginTop: 'var(--s-3)' }}>
          {error}
        </p>
      )}
    </form>
  );
}

// ─────────────────────────── meta fetch feedback ───────────────────────────

type MetaFetchStatus =
  | { kind: 'idle' }
  | { kind: 'fetching' }
  | { kind: 'ok'; filled: string[] }
  | { kind: 'empty' }
  | { kind: 'error' };

interface MetaFeedbackProps {
  status: MetaFetchStatus;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

/** One-liner under the URL field reporting what we just pulled in. */
function MetaFeedback({ status, t }: MetaFeedbackProps) {
  if (status.kind === 'idle' || status.kind === 'fetching') return null;

  if (status.kind === 'ok') {
    return (
      <p style={{ marginTop: 'var(--s-2)', fontSize: 12, color: 'var(--ink-3)' }}>
        {t('add.metaFetchedNote', { fields: status.filled.join(', ') })}
      </p>
    );
  }
  if (status.kind === 'empty') {
    return (
      <p style={{ marginTop: 'var(--s-2)', fontSize: 12, color: 'var(--ink-3)' }}>
        {t('add.metaFetchEmpty')}
      </p>
    );
  }
  return (
    <p style={{ marginTop: 'var(--s-2)', fontSize: 12, color: 'var(--accent-deep)' }}>
      {t('add.metaFetchError')}
    </p>
  );
}

// ─────────────────────────── chips ───────────────────────────

interface OccasionChipProps {
  kind: Occasion;
  active: boolean;
  onClick: () => void;
}

function OccasionChip({ kind, active, onClick }: OccasionChipProps) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? 'var(--ink)' : 'transparent',
        color: active ? 'var(--paper)' : 'var(--ink)',
        border: `1px solid ${active ? 'var(--ink)' : 'var(--hair-strong)'}`,
        padding: '6px 12px',
        borderRadius: 'var(--r-pill)',
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.06,
        textTransform: 'uppercase',
      }}
    >
      {t(`occasion.${kind}`)}
    </button>
  );
}

interface GroupChipProps {
  label: string;
  emoji: string | null;
  active: boolean;
  onClick: () => void;
}

function GroupChip({ label, emoji, active, onClick }: GroupChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: 'var(--ink)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--hair-strong)'}`,
        padding: '6px 12px',
        borderRadius: 'var(--r-pill)',
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        fontSize: 12,
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {emoji && <span aria-hidden>{emoji}</span>}
      {label}
    </button>
  );
}
