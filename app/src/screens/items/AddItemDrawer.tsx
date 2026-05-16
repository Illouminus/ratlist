/**
 * `<AddItemDrawer>` — the slide-in form for adding a new wishlist item.
 *
 * Fields mirror the design (title, maker, price, occasion, note). v0.1
 * adds two:
 *   - `url`   — the source URL of the item, kept as plain text for now;
 *                metadata auto-fetch is planned as an Edge Function.
 *   - groups  — which circles to publish to. Default-on for all of the
 *                user's groups so the typical case ("share with everyone")
 *                is zero-click.
 *
 * The drawer itself (animation, scroll lock, escape-to-close) lives in
 * the generic `<Drawer>` atom.
 */
import { useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { OCCASIONS, type Occasion } from '../../lib/db';
import type { MyGroup } from '../../groups/useGroups';
import type { CreateItemInput, UseMyItemsResult } from '../../items/useMyItems';
import { Drawer } from '../../components/Drawer';
import { Field } from '../../components/Field';
import { SketchInput } from '../../components/SketchInput';
import { Button } from '../../components/Button';

interface AddItemDrawerProps {
  open: boolean;
  onClose: () => void;
  groups: MyGroup[];
  onCreate: UseMyItemsResult['createItem'];
}

export function AddItemDrawer({ open, onClose, groups, onCreate }: AddItemDrawerProps) {
  return (
    <Drawer open={open} onClose={onClose} ariaLabel="add item">
      {open && <AddItemForm groups={groups} onCreate={onCreate} onClose={onClose} />}
    </Drawer>
  );
}

// ─────────────────────────── form ───────────────────────────

interface AddItemFormProps {
  groups: MyGroup[];
  onCreate: UseMyItemsResult['createItem'];
  onClose: () => void;
}

/**
 * The form is mounted only while the drawer is open, so we can use plain
 * `useState` initialisers (no useEffect for reset). Closing then re-opening
 * the drawer remounts the form with a fresh blank state.
 */
function AddItemForm({ groups, onCreate, onClose }: AddItemFormProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [maker, setMaker] = useState('');
  const [url, setUrl] = useState('');
  const [priceText, setPriceText] = useState('');
  const [occasion, setOccasion] = useState<Occasion>('anytime');
  const [note, setNote] = useState('');
  // Default-on: all of the user's groups at mount time. If a group is
  // created in another tab while the drawer is open we won't auto-select
  // it — the user can close and re-open to refresh.
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(
    () => new Set(groups.map((g) => g.id)),
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

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) return;

    setSubmitting(true);
    setError(null);

    const input: CreateItemInput = {
      title: trimmedTitle,
      maker: maker.trim() || null,
      url: url.trim() || null,
      price_text: priceText.trim() || null,
      occasion,
      note: note.trim() || null,
      group_ids: Array.from(selectedGroups),
    };

    const result = await onCreate(input);
    if ('error' in result) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    onClose();
  }

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
        <div className="mono-meta">{t('add.title')}</div>
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
          {t('add.title')}
        </h2>
        <p
          className="marginalia"
          style={{ marginTop: 'var(--s-2)', fontSize: 16, color: 'var(--accent)' }}
        >
          {t('add.sub')}
        </p>
      </div>

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '0 0 var(--s-4)' }} />

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
        <SketchInput
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('add.urlPh')}
        />
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
          {submitting ? t('auth.sending') : t('add.save')}
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
