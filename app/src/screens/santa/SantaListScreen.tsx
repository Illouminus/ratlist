/**
 * `SantaListScreen` — directory of every Secret Santa event the caller
 * can see, plus a form to create a new one in any of the caller's
 * circles.
 *
 * Mirrors the same shape as `GroupsScreen`: editorial header → create
 * form → list of cards (or empty state with a rat).
 */
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { pluralForm } from '../../i18n/plural';
import { errorMessage } from '../../lib/errors';
import { useSantaEvents, type MySantaEvent } from '../../santa/useSantaEvents';
import { useGroups, type MyGroup } from '../../groups/useGroups';
import { PaperLayout } from '../../components/PaperLayout';
import { Field } from '../../components/Field';
import { SketchInput } from '../../components/SketchInput';
import { Button } from '../../components/Button';
import { SittingRat } from '../../components/rats';
import { ListSkeleton } from '../../components/Skeleton';

/** Inline block shown when the user has no groups yet — they otherwise
 *  see only the page header and an empty list, with no hint that the
 *  next step is "create a circle". */
function NoGroupsCta() {
  const { t } = useI18n();
  return (
    <section
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--s-5)',
        flexWrap: 'wrap',
        padding: 'var(--s-5)',
        background: '#fffdf6',
        border: '1px solid var(--hair)',
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <p
          className="display-italic"
          style={{
            fontSize: 'var(--display-s)',
            lineHeight: 1.1,
            margin: 0,
            marginBottom: 'var(--s-3)',
          }}
        >
          {t('santa.noGroupsTitle')}
        </p>
        <p
          style={{
            margin: 0,
            color: 'var(--ink-2)',
            fontSize: 14,
            lineHeight: 1.55,
            marginBottom: 'var(--s-4)',
          }}
        >
          {t('santa.noGroupsBody')}
        </p>
        <Link
          to="/groups"
          className="mono-meta"
          style={{ color: 'var(--accent)', textDecoration: 'none' }}
        >
          {t('santa.noGroupsCta')}
        </Link>
      </div>
      <div style={{ opacity: 0.85 }}>
        <SittingRat size={72} signText="?" />
      </div>
    </section>
  );
}

export function SantaListScreen() {
  const { t } = useI18n();
  const { query: eventsQ, createEvent } = useSantaEvents();
  const { query: groupsQ } = useGroups();

  const groups = groupsQ.status === 'ready' ? groupsQ.groups : [];
  // Wait until we know whether the user has groups before deciding which
  // create UI to show. Otherwise a fast initial render flashes the CTA
  // and then swaps it for the form a tick later.
  const groupsReady = groupsQ.status === 'ready';
  const showCta = groupsReady && groups.length === 0;
  const showForm = groupsReady && groups.length > 0;

  return (
    <PaperLayout>
      <header style={{ marginBottom: 'var(--s-6)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-3)' }}>
          {t('santa.eyebrow')}
        </div>
        <h2
          className="display-italic"
          style={{ fontSize: 'var(--display-m)', margin: 0, lineHeight: 1.1, letterSpacing: -1 }}
        >
          {t('santa.title')}
        </h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--ink-2)',
            marginTop: 'var(--s-3)',
            maxWidth: 560,
            lineHeight: 1.55,
          }}
        >
          {t('santa.sub')}
        </p>
      </header>

      {showCta && <NoGroupsCta />}
      {showForm && <CreateEventForm groups={groups} onCreate={createEvent} />}

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: 'var(--s-6) 0' }} />

      <EventsList query={eventsQ} />
    </PaperLayout>
  );
}

// ─────────────────────────── create form ───────────────────────────

interface CreateEventFormProps {
  groups: MyGroup[];
  onCreate: ReturnType<typeof useSantaEvents>['createEvent'];
}

function CreateEventForm({ groups, onCreate }: CreateEventFormProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  // Track only the user's explicit pick. When null, fall back to the
  // first group via `effectiveGroupId` — no setState-during-render or
  // useEffect needed.
  const [chosenGroupId, setChosenGroupId] = useState<string | null>(null);
  const effectiveGroupId = chosenGroupId ?? groups[0]?.id ?? '';
  const [budgetText, setBudgetText] = useState('');
  const [giftDate, setGiftDate] = useState('');
  const [drawDeadline, setDrawDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length === 0 || effectiveGroupId === '') return;

    setSubmitting(true);
    setError(null);
    const result = await onCreate({
      group_id: effectiveGroupId,
      name: trimmedName,
      budget_text: budgetText.trim() || null,
      gift_date: giftDate || null,
      draw_deadline: drawDeadline ? new Date(drawDeadline).toISOString() : null,
    });
    setSubmitting(false);

    if ('error' in result) {
      setError(errorMessage(t, result.error));
    } else {
      setName('');
      setBudgetText('');
      setGiftDate('');
      setDrawDeadline('');
    }
  }

  // Parent only mounts CreateEventForm when there's at least one group,
  // so we don't need a guard here.

  return (
    <section>
      <div className="mono-meta" style={{ marginBottom: 'var(--s-3)', color: 'var(--ink-3)' }}>
        {t('santa.createTitle')}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--s-4)',
        }}
      >
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label={t('santa.nameLabel')}>
            <SketchInput
              type="text"
              placeholder={t('santa.namePh')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
            />
          </Field>
        </div>

        <Field label={t('santa.groupLabel')}>
          <select
            value={effectiveGroupId}
            onChange={(e) => setChosenGroupId(e.target.value)}
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
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.emoji ? `${g.emoji} ` : ''}
                {g.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('santa.budgetLabel')}>
          <SketchInput
            type="text"
            placeholder={t('santa.budgetPh')}
            value={budgetText}
            onChange={(e) => setBudgetText(e.target.value)}
          />
        </Field>

        <Field label={t('santa.dateLabel')}>
          <SketchInput
            type="date"
            value={giftDate}
            onChange={(e) => setGiftDate(e.target.value)}
          />
        </Field>

        <Field label={t('santa.deadlineLabel')}>
          <SketchInput
            type="datetime-local"
            value={drawDeadline}
            onChange={(e) => setDrawDeadline(e.target.value)}
          />
        </Field>

        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || name.trim().length === 0 || effectiveGroupId === ''}
          >
            {submitting ? t('santa.creating') : t('santa.create')}
          </Button>
        </div>

        {error && (
          <p
            style={{ gridColumn: '1 / -1', color: 'var(--accent-deep)', fontSize: 13 }}
          >
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

// ─────────────────────────── list ───────────────────────────

function EventsList({ query }: { query: ReturnType<typeof useSantaEvents>['query'] }) {
  const { t, lang } = useI18n();

  if (query.status === 'loading') {
    return <ListSkeleton rows={3} />;
  }
  if (query.status === 'error') {
    return <p style={{ color: 'var(--accent-deep)' }}>{query.error}</p>;
  }
  if (query.status === 'anonymous') return null;

  if (query.events.length === 0) {
    return (
      <section
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--s-6)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <p
            className="display-italic"
            style={{ fontSize: 22, color: 'var(--ink-2)', marginBottom: 'var(--s-2)' }}
          >
            {t('santa.empty')}
          </p>
          <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('santa.emptyBody')}</p>
        </div>
        <div style={{ opacity: 0.85 }}>
          <SittingRat size={72} signText="🎁" />
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mono-meta" style={{ marginBottom: 'var(--s-3)', color: 'var(--ink-3)' }}>
        {t('santa.yours')}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        {query.events.map((e) => (
          <EventRow key={e.id} event={e} lang={lang} />
        ))}
      </ul>
    </section>
  );
}

interface EventRowProps {
  event: MySantaEvent;
  lang: 'ru' | 'en';
}

function EventRow({ event, lang }: EventRowProps) {
  const { t } = useI18n();
  const participantWord = useMemo(
    () =>
      pluralForm(lang, event.participant_count, {
        one: t('groups.memberWord1'),
        few: t('groups.memberWord2'),
        many: t('groups.memberWord5'),
      }),
    [lang, event.participant_count, t],
  );

  return (
    <li
      style={{
        padding: 'var(--s-5)',
        background: '#fffdf6',
        border: '1px solid var(--hair)',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 'var(--s-4)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <h3
          className="display-italic"
          style={{ margin: 0, fontSize: 22, letterSpacing: -0.4 }}
        >
          {event.name}
        </h3>
        <div
          style={{
            display: 'flex',
            gap: 'var(--s-3)',
            alignItems: 'baseline',
            marginTop: 'var(--s-2)',
            flexWrap: 'wrap',
          }}
        >
          <span className="mono-meta" style={{ color: 'var(--ink-3)' }}>
            {t('santa.inGroup', { group: event.group_name })}
          </span>
          <span className="mono-meta" style={{ color: 'var(--accent)' }}>
            {t(`santa.status${capitalize(event.status)}`)}
          </span>
          <span className="mono-meta" style={{ color: 'var(--ink-3)' }}>
            {event.participant_count} {participantWord}
          </span>
          {event.is_organiser && (
            <span className="mono-meta" style={{ color: 'var(--ink-2)' }}>
              {t('santa.organiser')}
            </span>
          )}
        </div>
      </div>
      <Link
        to={`/santa/${event.id}`}
        className="mono-meta"
        style={{ color: 'var(--accent)', textDecoration: 'none' }}
      >
        {t('santa.open')}
      </Link>
    </li>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
