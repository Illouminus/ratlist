/**
 * `SantaEventScreen` — full detail view of one Secret Santa event at
 * `/santa/:eventId`. Composed of independent sections; each only renders
 * when relevant to the current event status / caller role:
 *
 *   header              always — name, group, status badge, budget + dates
 *   participants        always — join / leave button when applicable
 *   draw button         organiser-only, status === 'collecting'
 *   assignment block    participants, status in (drawn|revealed)
 *   reveal button       organiser-only, status === 'drawn'
 *   all pairings        everyone, status === 'revealed'
 *
 * State transitions are driven by the underlying hook; this component
 * is purely a function of the data it gets back.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import {
  useSantaEvent,
  type MyAssignment,
  type SantaAssignmentRow,
  type SantaEvent,
  type SantaExclusion,
  type SantaParticipant,
} from '../../santa/useSantaEvent';
import { PaperLayout } from '../../components/PaperLayout';
import { Button } from '../../components/Button';
import { SittingRat } from '../../components/rats';
import { useAuth } from '../../auth/useAuth';
import { errorMessage } from '../../lib/errors';

export function SantaEventScreen() {
  const { t } = useI18n();
  const { eventId } = useParams<{ eventId: string }>();
  const { user: me } = useAuth();
  const { query, join, leave, addExclusion, removeExclusion, runDraw, reveal } =
    useSantaEvent(eventId ?? null);

  if (query.status === 'loading') {
    return (
      <PaperLayout>
        <p className="mono-meta" style={{ color: 'var(--ink-3)' }}>
          …
        </p>
      </PaperLayout>
    );
  }
  if (query.status === 'error') {
    return (
      <PaperLayout>
        <p style={{ color: 'var(--accent-deep)' }}>{query.error}</p>
      </PaperLayout>
    );
  }
  if (query.status === 'anonymous') return null;

  const { event, participants, exclusions, myAssignment, allAssignments } = query.data;
  const isOrganiser = me?.id === event.created_by;
  const isParticipant = participants.some((p) => p.user_id === me?.id);

  return (
    <PaperLayout>

      <Header event={event} />

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '0 0 var(--s-6)' }} />

      <ParticipantsSection
        participants={participants}
        meId={me?.id ?? null}
        eventStatus={event.status}
        isParticipant={isParticipant}
        onJoin={join}
        onLeave={leave}
      />

      {event.status === 'collecting' && (
        <ExclusionsSection
          exclusions={exclusions}
          participants={participants}
          isOrganiser={isOrganiser}
          onAdd={addExclusion}
          onRemove={removeExclusion}
        />
      )}

      {isOrganiser && event.status === 'collecting' && (
        <OrganiserDrawSection
          ready={participants.length >= 2}
          onDraw={runDraw}
        />
      )}

      {(event.status === 'drawn' || event.status === 'revealed') && (
        <AssignmentSection assignment={myAssignment} isParticipant={isParticipant} />
      )}

      {isOrganiser && event.status === 'drawn' && (
        <OrganiserRevealSection onReveal={reveal} />
      )}

      {event.status === 'revealed' && (
        <RevealedAllPairings assignments={allAssignments} />
      )}

      {isOrganiser && (
        <p
          style={{
            marginTop: 'var(--s-7)',
            fontSize: 12,
            color: 'var(--ink-3)',
            maxWidth: 540,
            lineHeight: 1.55,
          }}
        >
          {t('santa.organiserNote')}
        </p>
      )}
    </PaperLayout>
  );
}

// ─────────────────────────── header ───────────────────────────

function Header({ event }: { event: SantaEvent }) {
  const { t } = useI18n();

  return (
    <div style={{ marginBottom: 'var(--s-5)' }}>
      <div className="mono-meta" style={{ marginBottom: 'var(--s-3)' }}>
        {t('santa.eyebrow')}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-4)', flexWrap: 'wrap' }}>
        <h2
          className="display-italic"
          style={{ fontSize: 'var(--display-l)', margin: 0, lineHeight: 1.05, letterSpacing: -1.4 }}
        >
          {event.name}
        </h2>
        <StatusBadge status={event.status} />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 'var(--s-4)',
          flexWrap: 'wrap',
          marginTop: 'var(--s-3)',
          color: 'var(--ink-3)',
          fontSize: 13,
        }}
      >
        {event.budget_text && (
          <span>
            <span className="mono-meta" style={{ marginRight: 6 }}>
              {t('santa.budgetLabel')}
            </span>
            <span style={{ color: 'var(--ink-2)' }}>{event.budget_text}</span>
          </span>
        )}
        {event.gift_date && (
          <span>
            <span className="mono-meta" style={{ marginRight: 6 }}>
              {t('santa.dateLabel')}
            </span>
            <span style={{ color: 'var(--ink-2)' }}>
              {new Date(event.gift_date).toLocaleDateString()}
            </span>
          </span>
        )}
        {event.draw_deadline && (
          <span>
            <span className="mono-meta" style={{ marginRight: 6 }}>
              {t('santa.deadlineLabel')}
            </span>
            <span style={{ color: 'var(--ink-2)' }}>
              {new Date(event.draw_deadline).toLocaleString()}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: SantaEvent['status'] }) {
  const { t } = useI18n();
  const label = t(`santa.status${status.charAt(0).toUpperCase()}${status.slice(1)}`);
  const color = status === 'collecting' ? 'var(--ink-2)' : 'var(--accent)';
  return (
    <span
      className="marginalia"
      style={{
        fontSize: 18,
        color,
        transform: 'rotate(-2deg)',
        display: 'inline-block',
      }}
    >
      ({label})
    </span>
  );
}

// ─────────────────────────── participants ───────────────────────────

interface ParticipantsSectionProps {
  participants: SantaParticipant[];
  meId: string | null;
  eventStatus: SantaEvent['status'];
  isParticipant: boolean;
  onJoin: () => Promise<{ ok: true } | { error: string }>;
  onLeave: () => Promise<{ ok: true } | { error: string }>;
}

function ParticipantsSection({
  participants,
  meId,
  eventStatus,
  isParticipant,
  onJoin,
  onLeave,
}: ParticipantsSectionProps) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin(): Promise<void> {
    setPending(true);
    setError(null);
    const result = await onJoin();
    setPending(false);
    if ('error' in result) setError(errorMessage(t, result.error));
  }
  async function handleLeave(): Promise<void> {
    setPending(true);
    setError(null);
    const result = await onLeave();
    setPending(false);
    if ('error' in result) setError(errorMessage(t, result.error));
  }

  const canJoin = eventStatus === 'collecting' && !isParticipant;
  const canLeave = eventStatus === 'collecting' && isParticipant;

  return (
    <section style={{ marginBottom: 'var(--s-6)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--s-4)',
          marginBottom: 'var(--s-3)',
        }}
      >
        <div className="mono-meta" style={{ color: 'var(--ink-3)' }}>
          {t('santa.participants')} · {participants.length}
        </div>
        {canJoin && (
          <Button variant="primary" onClick={() => void handleJoin()} disabled={pending}>
            {pending ? t('santa.joining') : t('santa.join')}
          </Button>
        )}
        {canLeave && (
          <Button variant="ghost" onClick={() => void handleLeave()} disabled={pending}>
            {t('santa.leave')}
          </Button>
        )}
      </div>

      {participants.length === 0 ? (
        <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('santa.empty')}</p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--s-3)',
          }}
        >
          {participants.map((p) => (
            <ParticipantChip key={p.user_id} participant={p} isMe={p.user_id === meId} />
          ))}
        </ul>
      )}

      {error && (
        <p style={{ color: 'var(--accent-deep)', fontSize: 13, marginTop: 'var(--s-3)' }}>
          {error}
        </p>
      )}
    </section>
  );
}

function ParticipantChip({
  participant,
  isMe,
}: {
  participant: SantaParticipant;
  isMe: boolean;
}) {
  const { t } = useI18n();
  return (
    <li
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--s-2)',
        padding: '4px 12px 4px 4px',
        background: isMe ? 'var(--accent-soft)' : '#fffdf6',
        border: `1px solid ${isMe ? 'var(--accent)' : 'var(--hair)'}`,
        borderRadius: 'var(--r-pill)',
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'var(--accent-wash)',
          color: 'var(--ink)',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontWeight: 500,
          fontSize: 12,
          boxShadow: 'inset 0 0 0 1px var(--hair-strong)',
        }}
      >
        {participant.user.display_name.charAt(0).toUpperCase()}
      </span>
      <span style={{ fontSize: 13, color: 'var(--ink)' }}>
        {isMe ? t('friend.you') : participant.user.display_name}
      </span>
    </li>
  );
}

// ─────────────────────────── exclusions ───────────────────────────

interface ExclusionsSectionProps {
  exclusions: SantaExclusion[];
  participants: SantaParticipant[];
  isOrganiser: boolean;
  onAdd: (
    userA: string,
    userB: string,
    mutual: boolean,
  ) => Promise<{ ok: true } | { error: string }>;
  onRemove: (userA: string, userB: string) => Promise<{ ok: true } | { error: string }>;
}

/**
 * Lists existing "user_a should not draw user_b" rules and lets the
 * organiser add new ones. Non-organisers can see the list (so they
 * know what the draw will respect) but can't edit it.
 */
function ExclusionsSection({
  exclusions,
  participants,
  isOrganiser,
  onAdd,
  onRemove,
}: ExclusionsSectionProps) {
  const { t } = useI18n();
  const [userA, setUserA] = useState<string>('');
  const [userB, setUserB] = useState<string>('');
  const [mutual, setMutual] = useState<boolean>(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hide the whole section if there's nothing to show *and* no one can
  // add anything — keeps the page tidy for non-organisers in groups
  // without exclusions.
  if (!isOrganiser && exclusions.length === 0) return null;

  async function handleAdd(): Promise<void> {
    setError(null);
    if (!userA || !userB || userA === userB) {
      setError(t('santa.exclusionPickPair'));
      return;
    }
    setAdding(true);
    const result = await onAdd(userA, userB, mutual);
    setAdding(false);
    if ('error' in result) {
      setError(errorMessage(t, result.error));
      return;
    }
    setUserA('');
    setUserB('');
  }

  return (
    <section style={{ marginBottom: 'var(--s-6)' }}>
      <div
        className="mono-meta"
        style={{ marginBottom: 'var(--s-2)', color: 'var(--ink-3)' }}
      >
        {t('santa.exclusionsTitle')}
      </div>
      {isOrganiser && (
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-3)',
            marginBottom: 'var(--s-3)',
            maxWidth: 560,
            lineHeight: 1.5,
          }}
        >
          {t('santa.exclusionsSub')}
        </p>
      )}

      {exclusions.length === 0 ? (
        <p style={{ color: 'var(--ink-3)', fontSize: 13, marginBottom: 'var(--s-3)' }}>
          {t('santa.exclusionEmpty')}
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '0 0 var(--s-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s-2)',
          }}
        >
          {exclusions.map((e) => (
            <li
              key={`${e.user_a_id}-${e.user_b_id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--s-3)',
                padding: 'var(--s-2) 0',
                borderBottom: '1px solid var(--hair)',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 14, color: 'var(--ink)' }}>
                <strong>{e.user_a.display_name}</strong>{' '}
                <span style={{ color: 'var(--accent)' }}>{t('santa.exclusionGives')}</span>{' '}
                <strong>{e.user_b.display_name}</strong>
              </span>
              {isOrganiser && (
                <button
                  type="button"
                  onClick={() => void onRemove(e.user_a_id, e.user_b_id)}
                  className="mono-meta"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    color: 'var(--accent-deep)',
                  }}
                >
                  {t('santa.exclusionRemove')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isOrganiser && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--s-3)',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            background: '#fffdf6',
            padding: 'var(--s-3) var(--s-4)',
            border: '1px solid var(--hair)',
          }}
        >
          <ExclusionUserSelect
            label={t('santa.exclusionFromLabel')}
            participants={participants}
            value={userA}
            onChange={setUserA}
          />
          <ExclusionUserSelect
            label={t('santa.exclusionToLabel')}
            participants={participants}
            value={userB}
            onChange={setUserB}
            disabledId={userA}
          />
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              color: 'var(--ink-2)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={mutual}
              onChange={(e) => setMutual(e.target.checked)}
            />
            {t('santa.exclusionMutualLabel')}
          </label>
          <Button
            variant="primary"
            onClick={() => void handleAdd()}
            disabled={adding || !userA || !userB || userA === userB}
          >
            {adding ? t('santa.exclusionAdding') : t('santa.exclusionAdd')}
          </Button>
          {error && (
            <p style={{ width: '100%', color: 'var(--accent-deep)', fontSize: 13, margin: 0 }}>
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ExclusionUserSelect({
  label,
  participants,
  value,
  onChange,
  disabledId,
}: {
  label: string;
  participants: SantaParticipant[];
  value: string;
  onChange: (next: string) => void;
  disabledId?: string;
}) {
  const { t } = useI18n();
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontSize: 13,
        minWidth: 140,
      }}
    >
      <span className="mono-meta" style={{ color: 'var(--ink-3)' }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '6px 0',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--hair-strong)',
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          color: 'var(--ink)',
          outline: 'none',
        }}
      >
        <option value="">{t('santa.exclusionPickPair')}</option>
        {participants.map((p) => (
          <option key={p.user_id} value={p.user_id} disabled={p.user_id === disabledId}>
            {p.user.display_name}
          </option>
        ))}
      </select>
    </label>
  );
}

// ─────────────────────────── organiser actions ───────────────────────────

function OrganiserDrawSection({
  ready,
  onDraw,
}: {
  ready: boolean;
  onDraw: () => Promise<{ ok: true } | { error: string }>;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDraw(): Promise<void> {
    setPending(true);
    setError(null);
    const result = await onDraw();
    setPending(false);
    if ('error' in result) setError(errorMessage(t, result.error));
  }

  return (
    <section
      style={{
        marginBottom: 'var(--s-6)',
        padding: 'var(--s-5)',
        background: 'var(--accent-soft)',
        border: '1px solid var(--accent-wash)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-3)',
      }}
    >
      <Button
        variant="dark"
        onClick={() => void handleDraw()}
        disabled={!ready || pending}
        style={{ alignSelf: 'flex-start' }}
      >
        {pending ? t('santa.drawing') : t('santa.drawCta')}
      </Button>
      {!ready && (
        <p style={{ color: 'var(--ink-2)', fontSize: 13, margin: 0 }}>
          {t('santa.drawTooFew')}
        </p>
      )}
      {error && (
        <p style={{ color: 'var(--accent-deep)', fontSize: 13, margin: 0 }}>{error}</p>
      )}
    </section>
  );
}

function OrganiserRevealSection({
  onReveal,
}: {
  onReveal: () => Promise<{ ok: true } | { error: string }>;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReveal(): Promise<void> {
    setPending(true);
    setError(null);
    const result = await onReveal();
    setPending(false);
    if ('error' in result) setError(errorMessage(t, result.error));
  }

  return (
    <section style={{ marginBottom: 'var(--s-6)' }}>
      <Button variant="ghost" onClick={() => void handleReveal()} disabled={pending}>
        {pending ? t('santa.revealing') : t('santa.revealCta')}
      </Button>
      {error && (
        <p style={{ color: 'var(--accent-deep)', fontSize: 13 }}>{error}</p>
      )}
    </section>
  );
}

// ─────────────────────────── assignment ───────────────────────────

function AssignmentSection({
  assignment,
  isParticipant,
}: {
  assignment: MyAssignment | null;
  isParticipant: boolean;
}) {
  const { t } = useI18n();

  if (!isParticipant) {
    return (
      <section style={{ marginBottom: 'var(--s-6)' }}>
        <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>{t('santa.youCannotSeeYet')}</p>
      </section>
    );
  }

  if (!assignment) {
    // Edge case: you're listed as a participant but the assignments table
    // has no row for you. Could happen if the draw failed mid-write.
    return null;
  }

  return (
    <section
      style={{
        marginBottom: 'var(--s-6)',
        padding: 'var(--s-5)',
        background: '#fffdf6',
        border: '1px solid var(--accent)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s-4)',
        flexWrap: 'wrap',
      }}
    >
      <SittingRat size={56} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
          {t('santa.drawnHeader')}
        </div>
        <div
          className="display-italic"
          style={{ fontSize: 'var(--display-s)', color: 'var(--ink)', lineHeight: 1.1 }}
        >
          {assignment.receiver.display_name}
        </div>
      </div>
      <Link
        to={`/p/${assignment.receiver.id}`}
        className="mono-meta"
        style={{ color: 'var(--accent)', textDecoration: 'none' }}
      >
        {t('santa.drawnGoToList')}
      </Link>
    </section>
  );
}

// ─────────────────────────── all pairings (revealed) ───────────────────────────

function RevealedAllPairings({ assignments }: { assignments: SantaAssignmentRow[] }) {
  const { t } = useI18n();
  if (assignments.length === 0) return null;
  return (
    <section style={{ marginBottom: 'var(--s-6)' }}>
      <div className="mono-meta" style={{ color: 'var(--ink-3)', marginBottom: 'var(--s-3)' }}>
        {t('santa.pairings')}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {assignments.map((a) => (
          <li
            key={a.giver_id}
            style={{
              padding: 'var(--s-3) 0',
              borderBottom: '1px solid var(--hair)',
              fontSize: 15,
              color: 'var(--ink)',
              display: 'flex',
              gap: 'var(--s-3)',
              alignItems: 'baseline',
            }}
          >
            <span style={{ fontWeight: 600 }}>{a.giver.display_name}</span>
            <span style={{ color: 'var(--accent)' }}>{t('santa.gives')}</span>
            <span>{a.receiver.display_name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
