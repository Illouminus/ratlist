/**
 * `<ItemForm>` — the editable item form used by both AddItemScreen
 * (`/add`) and EditItemScreen (`/i/:itemId/edit`).
 *
 * The form is the same in both modes — only the submit handler and the
 * "what to call this action" labels differ. Mode is inferred from
 * `initial`: pass an existing item to edit it, omit to start fresh.
 *
 * URL meta auto-fill, photo upload, group multi-select, occasion chips —
 * all live here. The two screens are thin wrappers that just provide
 * the page chrome and decide where to navigate after submit.
 */
import { useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { OCCASIONS, type Occasion } from '../../lib/db';
import type { MyGroup } from '../../groups/useGroups';
import type { CreateItemInput, MyItem } from '../../items/useMyItems';
import { Field } from '../../components/Field';
import { SketchInput } from '../../components/SketchInput';
import { Button } from '../../components/Button';
import { PriorityDots } from '../../components/PriorityDots';
import { PhotoField } from './PhotoField';
import { fetchUrlMeta } from '../../items/fetchUrlMeta';
import { errorMessage } from '../../lib/errors';

/** Hard cap on item title length. Mirrors the DB CHECK constraint. */
const MAX_TITLE_LENGTH = 200;
/** Soft cap when auto-filling from a fetched URL. Long page titles
 *  (GitHub repo descriptions, news article H1s) are usually not what you
 *  want as a wishlist item title — truncate for the user. */
const AUTOFILL_TITLE_LENGTH = 100;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

export interface ItemFormProps {
  /** Pre-fill the form from an existing item; omit for create mode. */
  initial?: MyItem | null;
  /** All groups the caller is a member of — used for the publish chips. */
  groups: MyGroup[];
  /** Persist handler. Receives the form input and decides create vs
   *  update on the caller's side. */
  onSubmit: (input: CreateItemInput) => Promise<{ item: MyItem } | { error: string }>;
  /** Optional cancel button. Hidden when not provided (e.g. add flow on
   *  a small screen where Cancel is in the top bar). */
  onCancel?: () => void;
  /** Label shown on the submit button — defaults to a generic Save. */
  submitLabel?: string;
}

export function ItemForm({ initial, groups, onSubmit, onCancel, submitLabel }: ItemFormProps) {
  const { t } = useI18n();
  const isEdit = !!initial;

  const [title, setTitle] = useState<string>(initial?.title ?? '');
  const [maker, setMaker] = useState<string>(initial?.maker ?? '');
  const [url, setUrl] = useState<string>(initial?.url ?? '');
  const [priceText, setPriceText] = useState<string>(initial?.price_text ?? '');
  const [occasion, setOccasion] = useState<Occasion>(
    (initial?.occasion as Occasion | undefined) ?? 'anytime',
  );
  // priority is stored as 1..3 in the DB (1 = "really want", 3 = "nice
  // to have"). Default to 2 (the DB default) for fresh items.
  const [priority, setPriority] = useState<1 | 2 | 3>(
    initial?.priority === 1 || initial?.priority === 3 ? initial.priority : 2,
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
      priority,
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
    // Don't flip submitting back — the parent will navigate away on
    // success, and toggling state during the unmount is a noisy log.
  }

  const finalSubmitLabel = submitLabel ?? (isEdit ? t('add.saveChanges') : t('add.save'));

  return (
    <form onSubmit={handleSubmit} noValidate>
      <PhotoField value={coverUrl} onChange={setCoverUrl} />

      <Field label={t('add.thing')}>
        <SketchInput
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('add.thingPh')}
          autoFocus={!isEdit}
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

      <Field label={t('add.priorityLabel')}>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          {([1, 2, 3] as const).map((p) => (
            <PriorityChip
              key={p}
              level={p}
              active={priority === p}
              onClick={() => setPriority(p)}
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
          justifyContent: onCancel ? 'space-between' : 'flex-end',
          alignItems: 'center',
          marginTop: 'var(--s-5)',
        }}
      >
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t('add.cancel')}
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={submitting || title.trim().length === 0}
        >
          {submitting ? t('auth.sending') : finalSubmitLabel}
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

interface PriorityChipProps {
  level: 1 | 2 | 3;
  active: boolean;
  onClick: () => void;
}

/** Same chip shape as OccasionChip, but with a leading dot cluster
 *  (•••, ••, •) that mirrors the row-level priority marker. The chip's
 *  label translates to the long-form ("очень хочу" / "хочу" / "если
 *  найдётся") so the meaning is clear in the form even before the
 *  reader learns the dot convention. */
function PriorityChip({ level, active, onClick }: PriorityChipProps) {
  const { t } = useI18n();
  const label =
    level === 1 ? t('item.priorityHigh') : level === 2 ? t('item.priorityMid') : t('item.priorityLow');
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
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <PriorityDots level={level} muted={!active} />
      {label}
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
