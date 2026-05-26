/**
 * `EventDetailScreen` — `/events/:id`. Two views in one:
 *
 * Honoree mode (owner): inline edit of title / kind / date / note,
 *   add/remove audience circles, add/remove curated items, delete event.
 *
 * Guest mode (audience member): read-only header, claim / release each
 *   curated item. Claim privacy is RLS-enforced — the honoree never sees
 *   any claim row (see `claims` RLS in 20260516120000_init.sql), so this
 *   page just renders what comes back.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { useEvent, type EventClaim } from '../../events/useEvent';
import {
  useEventParticipants,
  type EventParticipant,
} from '../../events/useEventParticipants';
import { useMyItems, type MyItem } from '../../items/useMyItems';
import { useAuth } from '../../auth/useAuth';
import { useToast } from '../../components/useToast';
import { useConfirm } from '../../components/useConfirm';
import { errorMessage } from '../../lib/errors';
import { EVENT_KINDS, type EventKind } from '../../lib/db';
import { PaperLayout } from '../../components/PaperLayout';
import { ItemPhoto } from '../../components/ItemPhoto';
import { ListSkeleton } from '../../components/Skeleton';
import { Field } from '../../components/Field';
import { SketchInput } from '../../components/SketchInput';
import { Button } from '../../components/Button';
import { InviteFromPeopleModal } from './InviteFromPeopleModal';
import { groupByPriority } from '../../items/groupByPriority';
import { PrioritySectionHeader } from '../../components/PrioritySectionHeader';
import { ClaimControl } from './ClaimControl';

export function EventDetailScreen() {
  const { eventId } = useParams<{ eventId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const {
    query,
    update,
    remove,
    attachItem,
    detachItem,
    claim,
    release,
  } = useEvent(eventId ?? null);

  if (query.status === 'loading') {
    return (
      <PaperLayout>
        <ListSkeleton rows={4} />
      </PaperLayout>
    );
  }
  if (query.status === 'anonymous') return null;
  if (query.status === 'error') {
    return (
      <PaperLayout>
        <p style={{ color: 'var(--accent-deep)' }}>{errorMessage(t, query.error)}</p>
        <Link to="/events" className="mono-meta" style={{ color: 'var(--accent)' }}>
          ← {t('events.backToList')}
        </Link>
      </PaperLayout>
    );
  }

  const { event, items, isHonoree } = query.data;
  const showShareCard = isHonoree && searchParams.get('share') === '1';

  function dismissShareCard() {
    const next = new URLSearchParams(searchParams);
    next.delete('share');
    setSearchParams(next, { replace: true });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: t('events.deleteConfirmTitle'),
      body: t('events.deleteConfirm', { title: event.title }),
      confirmLabel: t('events.delete'),
      danger: true,
    });
    if (!ok) return;
    const result = await remove();
    if ('error' in result) {
      toast.show(errorMessage(t, result.error));
      return;
    }
    toast.show(t('events.deletedToast'));
    navigate('/events', { replace: true });
  }

  return (
    <PaperLayout>
      <Link
        to="/events"
        className="mono-meta"
        style={{
          color: 'var(--ink-3)',
          textDecoration: 'none',
          display: 'inline-block',
          marginBottom: 'var(--s-4)',
        }}
      >
        ← {t('events.backToList')}
      </Link>

      {showShareCard && (
        <ShareCard
          shareToken={event.share_token}
          onCopied={() => toast.show(t('events.share.copied'))}
          onDismiss={dismissShareCard}
        />
      )}

      {isHonoree ? (
        <HonoreeHeader event={event} onSave={update} />
      ) : (
        <GuestHeader event={event} />
      )}

      {isHonoree && event.share_token && !showShareCard && (
        <InlineShareActions
          shareToken={event.share_token}
          onCopied={() => toast.show(t('events.share.copied'))}
          onInvite={() => setInviteOpen(true)}
        />
      )}

      {isHonoree && eventId && <ParticipantsSection eventId={eventId} />}

      <ItemsSection
        items={items}
        isHonoree={isHonoree}
        myUserId={user?.id ?? null}
        onAttach={attachItem}
        onDetach={detachItem}
        onClaim={claim}
        onRelease={release}
      />

      {isHonoree && (
        <footer
          style={{
            marginTop: 'var(--s-7)',
            paddingTop: 'var(--s-4)',
            borderTop: '1px solid var(--hair)',
            textAlign: 'center',
          }}
        >
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="mono-meta"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: 'var(--accent-deep)',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            {t('events.deleteCta')}
          </button>
        </footer>
      )}

      {isHonoree && eventId && (
        <InviteFromPeopleModal
          eventId={eventId}
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          showToast={(msg) => toast.show(msg)}
        />
      )}
    </PaperLayout>
  );
}

// ─────────────────────────── headers ───────────────────────────

interface HeaderEvent {
  id: string;
  title: string;
  kind: string;
  occurs_on: string | null;
  note: string | null;
}

function GuestHeader({ event }: { event: HeaderEvent }) {
  const { t } = useI18n();
  return (
    <header style={{ marginBottom: 'var(--s-6)' }}>
      <div className="mono-meta" style={{ marginBottom: 'var(--s-3)', color: 'var(--ink-3)' }}>
        {t(`events.kind.${event.kind}`)}
        {event.occurs_on && ` · ${formatDate(event.occurs_on)}`}
      </div>
      <h1
        className="display-italic"
        style={{
          fontSize: 'var(--display-l)',
          margin: 0,
          lineHeight: 1.05,
          letterSpacing: -1,
        }}
      >
        {event.title}
      </h1>
      {event.note && (
        <p
          style={{
            marginTop: 'var(--s-3)',
            color: 'var(--ink-2)',
            fontSize: 15,
            lineHeight: 1.5,
          }}
        >
          {event.note}
        </p>
      )}
    </header>
  );
}

interface HonoreeHeaderProps {
  event: HeaderEvent;
  onSave: (input: {
    title?: string;
    kind?: EventKind;
    occurs_on?: string | null;
    note?: string | null;
  }) => Promise<{ ok: true } | { error: string }>;
}

function HonoreeHeader({ event, onSave }: HonoreeHeaderProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [kind, setKind] = useState<EventKind>(event.kind as EventKind);
  const [occursOn, setOccursOn] = useState(event.occurs_on ?? '');
  const [note, setNote] = useState(event.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle(event.title);
    setKind(event.kind as EventKind);
    setOccursOn(event.occurs_on ?? '');
    setNote(event.note ?? '');
    setError(null);
  }

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length === 0) return;

    setSaving(true);
    setError(null);
    const result = await onSave({
      title: trimmed,
      kind,
      occurs_on: occursOn || null,
      note: note.trim() || null,
    });
    setSaving(false);

    if ('error' in result) {
      setError(errorMessage(t, result.error));
      return;
    }
    toast.show(t('events.savedToast'));
    setEditing(false);
  }

  if (!editing) {
    return (
      <header style={{ marginBottom: 'var(--s-6)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 'var(--s-4)',
            marginBottom: 'var(--s-3)',
          }}
        >
          <div className="mono-meta" style={{ color: 'var(--ink-3)' }}>
            {t(`events.kind.${event.kind}`)}
            {event.occurs_on && ` · ${formatDate(event.occurs_on)}`}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mono-meta"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: 'var(--accent)',
              cursor: 'pointer',
            }}
          >
            {t('events.editDetails')}
          </button>
        </div>
        <h1
          className="display-italic"
          style={{
            fontSize: 'var(--display-l)',
            margin: 0,
            lineHeight: 1.05,
            letterSpacing: -1,
          }}
        >
          {event.title}
        </h1>
        {event.note && (
          <p
            style={{
              marginTop: 'var(--s-3)',
              color: 'var(--ink-2)',
              fontSize: 15,
              lineHeight: 1.5,
            }}
          >
            {event.note}
          </p>
        )}
      </header>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      style={{
        marginBottom: 'var(--s-6)',
        padding: 'var(--s-5)',
        background: '#fffdf6',
        border: '1px solid var(--hair)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-4)',
      }}
    >
      <Field label={t('events.field.title')}>
        <SketchInput
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
        />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-4)' }}>
        <Field label={t('events.field.kind')}>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as EventKind)}
            style={selectStyle}
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
          rows={2}
          style={{ ...selectStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      </Field>
      {error && <p style={{ color: 'var(--accent-deep)', fontSize: 13 }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-3)' }}>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            reset();
            setEditing(false);
          }}
        >
          {t('events.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={saving || title.trim().length === 0}>
          {saving ? t('events.saving') : t('events.save')}
        </Button>
      </div>
    </form>
  );
}

const selectStyle = {
  width: '100%',
  padding: '8px 0',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--hair-strong)',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  color: 'var(--ink)',
  outline: 'none',
} as const;

// ─────────────────────────── inline share + participants ───────────────────────────

interface InlineShareActionsProps {
  shareToken: string;
  onCopied: () => void;
  onInvite: () => void;
}

/**
 * `<InlineShareActions>` — the new compact share-and-invite affordance
 * for honoree mode. Replaces the heavy URL+buttons block that used to
 * sit at the top of the page. Three mono-meta tokens, separated by
 * middots: passive label, copy action, invite action.
 */
function InlineShareActions({ shareToken, onCopied, onInvite }: InlineShareActionsProps) {
  const { t } = useI18n();
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://ratlist.app';
  const shareUrl = `${origin}/event/${shareToken}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      onCopied();
    } catch {
      // Clipboard API can fail in non-secure contexts or strict iframes.
      // Silently no-op — the user can still get the link from the email
      // invite. (A retry via document.execCommand is deprecated.)
    }
  }

  return (
    <div
      style={{
        marginTop: 'calc(-1 * var(--s-3))',
        marginBottom: 'var(--s-6)',
        display: 'flex',
        gap: 'var(--s-3)',
        flexWrap: 'wrap',
        alignItems: 'center',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.06,
        textTransform: 'uppercase',
      }}
    >
      <span style={{ color: 'var(--ink-3)' }}>{t('events.share.linkLabel')}</span>
      <span style={{ color: 'var(--hair-strong)' }} aria-hidden>·</span>
      <button
        type="button"
        onClick={() => void handleCopy()}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: 'var(--accent)',
          cursor: 'pointer',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          letterSpacing: 'inherit',
          textTransform: 'inherit',
        }}
      >
        {t('events.share.copyShort')}
      </button>
      <span style={{ color: 'var(--hair-strong)' }} aria-hidden>·</span>
      <button
        type="button"
        onClick={onInvite}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: 'var(--accent)',
          cursor: 'pointer',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          letterSpacing: 'inherit',
          textTransform: 'inherit',
        }}
      >
        {t('events.share.inviteShort')}
      </button>
    </div>
  );
}

/**
 * `<ParticipantsSection>` — honoree-only summary of who's in the event.
 * Replaces the old `<CoordinatorPanel>` shell: share/invite affordances
 * moved out to `<InlineShareActions>` above, leaving just the rendered
 * participants list (collapsible <details>) when at least one
 * participant exists. When the list is empty, this component renders
 * nothing — no chrome wasted on a zero-state.
 */
function ParticipantsSection({ eventId }: { eventId: string }) {
  const { query: participantsQ } = useEventParticipants(eventId);
  if (participantsQ.status !== 'ready' || participantsQ.participants.length === 0) {
    return null;
  }
  return (
    <section style={{ marginBottom: 'var(--s-5)' }}>
      <ParticipantList participants={participantsQ.participants} />
    </section>
  );
}

// ─────────────────────────── items ───────────────────────────

interface ItemsSectionProps {
  items: Array<{ item_id: string; item: MyItem | { id: string; cover_url: string | null; title: string; maker: string | null; price_text: string | null; note: string | null; owner_id: string; priority: number }; claims: EventClaim[] }>;
  isHonoree: boolean;
  myUserId: string | null;
  onAttach: (itemId: string) => Promise<{ ok: true } | { error: string }>;
  onDetach: (itemId: string) => Promise<{ ok: true } | { error: string }>;
  onClaim: (itemId: string) => Promise<{ ok: true } | { error: string }>;
  onRelease: (itemId: string) => Promise<{ ok: true } | { error: string }>;
}

function ItemsSection({
  items,
  isHonoree,
  myUserId,
  onAttach,
  onDetach,
  onClaim,
  onRelease,
}: ItemsSectionProps) {
  const { t } = useI18n();
  const { query: myItemsQ } = useMyItems();
  const [picking, setPicking] = useState(false);
  const attachedIds = new Set(items.map((it) => it.item_id));
  const myItems = myItemsQ.status === 'ready' ? myItemsQ.items : [];
  const availableItems = myItems.filter(
    (it) => it.status === 'active' && !attachedIds.has(it.id),
  );

  return (
    <section>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 'var(--s-3)',
        }}
      >
        <div className="mono-meta" style={{ color: 'var(--ink-3)' }}>
          {t('events.itemsLabel')}
        </div>
        {isHonoree && availableItems.length > 0 && (
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            className="mono-meta"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: 'var(--accent)',
              cursor: 'pointer',
            }}
          >
            {picking ? t('events.collapse') : t('events.addItems')}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>
          {isHonoree ? t('events.noItemsHonoree') : t('events.noItemsGuest')}
        </p>
      ) : (
        <>
          {groupByPriority(
            items.map((it) => ({ ...it, priority: it.item.priority })),
          ).map((section) =>
            section.items.length === 0 ? null : (
              <section key={section.level}>
                <PrioritySectionHeader level={section.level} count={section.items.length} />
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 'var(--s-5)',
                  }}
                >
                  {section.items.map((it) => (
                    <CuratedItemCard
                      key={it.item_id}
                      entry={it}
                      isHonoree={isHonoree}
                      myUserId={myUserId}
                      onDetach={() => void onDetach(it.item_id)}
                      onClaim={() => void onClaim(it.item_id)}
                      onRelease={() => void onRelease(it.item_id)}
                    />
                  ))}
                </ul>
              </section>
            ),
          )}
        </>
      )}

      {picking && isHonoree && (
        <div
          style={{
            marginTop: 'var(--s-5)',
            padding: 'var(--s-4)',
            background: '#fffdf6',
            border: '1px dashed var(--hair-strong)',
          }}
        >
          <div className="mono-meta" style={{ marginBottom: 'var(--s-3)', color: 'var(--ink-3)' }}>
            {t('events.pickFromList')}
          </div>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 'var(--s-4)',
            }}
          >
            {availableItems.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => void onAttach(it.id)}
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
                  <ItemPhoto coverUrl={it.cover_url} aspectRatio="4 / 3" alt={it.title} />
                  <div
                    style={{
                      paddingTop: 'var(--s-2)',
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: 13,
                      color: 'var(--ink)',
                      lineHeight: 1.3,
                    }}
                  >
                    + {it.title}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

interface CuratedItemCardProps {
  entry: ItemsSectionProps['items'][number];
  isHonoree: boolean;
  myUserId: string | null;
  onDetach: () => void;
  onClaim: () => void;
  onRelease: () => void;
}

function CuratedItemCard({
  entry,
  isHonoree,
  myUserId,
  onDetach,
  onClaim,
  onRelease,
}: CuratedItemCardProps) {
  const { t } = useI18n();
  const { item, claims } = entry;
  const myClaim = useMemo(
    () => (myUserId ? claims.find((c) => c.user_id === myUserId) ?? null : null),
    [claims, myUserId],
  );
  const othersClaim = useMemo(
    () => claims.find((c) => c.user_id !== myUserId) ?? null,
    [claims, myUserId],
  );
  const dimmed = !isHonoree && claims.length > 0 && !myClaim;

  return (
    <li>
      <div style={{ opacity: dimmed ? 0.55 : 1, position: 'relative' }}>
        <Link
          to={`/i/${item.id}`}
          style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
        >
          <ItemPhoto coverUrl={item.cover_url} aspectRatio="4 / 3" alt={item.title} />
        </Link>
        {isHonoree && (
          <button
            type="button"
            onClick={onDetach}
            aria-label={t('events.removeItem', { title: item.title })}
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: 'var(--paper)',
              color: 'var(--ink-2)',
              border: '1px solid var(--hair-strong)',
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            ×
          </button>
        )}
      </div>
      <div style={{ paddingTop: 'var(--s-3)' }}>
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: 15,
            color: 'var(--ink)',
            lineHeight: 1.3,
            textDecoration: dimmed ? 'line-through' : 'none',
          }}
        >
          {item.title}
        </h3>
        {item.maker && (
          <div style={{ marginTop: 2, fontSize: 12, color: 'var(--ink-3)' }}>{item.maker}</div>
        )}
        {item.price_text && (
          <div
            style={{
              marginTop: 4,
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: 14,
              color: 'var(--accent)',
            }}
          >
            {item.price_text}
          </div>
        )}
        {/* Owner's personal note — same 2-line clamp + ink-2 treatment used
            on MyList / friend list / public share. */}
        {item.note && (
          <div
            style={{
              marginTop: 'var(--s-2)',
              fontSize: 12,
              color: 'var(--ink-2)',
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.note}
          </div>
        )}
        {!isHonoree && (
          <div style={{ marginTop: 'var(--s-3)' }}>
            <ClaimControl
              myClaim={myClaim}
              othersClaim={othersClaim}
              onClaim={onClaim}
              onRelease={onRelease}
            />
          </div>
        )}
      </div>
    </li>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ─────────────────────────── share card ───────────────────────────

function ShareCard({
  shareToken,
  onCopied,
  onDismiss,
}: {
  shareToken: string;
  onCopied: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  // window.location.origin in tests is "http://localhost"; in the browser
  // it matches the deployed origin. Easier than reading SITE_URL from env
  // here — the user only ever sees this card with whatever origin they
  // typed into the address bar.
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ratlist.app';
  const shareUrl = `${origin}/event/${shareToken}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      onCopied();
    } catch {
      // Clipboard can fail in non-secure contexts or older browsers.
      // The URL is visible on the card anyway — the user can copy by hand.
    }
  }

  return (
    <section
      style={{
        background: 'var(--paper-2, #fffdf6)',
        border: '1px solid var(--hair)',
        padding: 'var(--s-5)',
        marginBottom: 'var(--s-5)',
      }}
    >
      <p
        className="marginalia"
        style={{
          fontSize: 22,
          color: 'var(--accent)',
          margin: 0,
          marginBottom: 'var(--s-2)',
          transform: 'rotate(-1.5deg)',
          display: 'inline-block',
        }}
      >
        {t('events.share.headline')}
      </p>
      <p style={{ color: 'var(--ink-2)', margin: '0 0 var(--s-3)', fontSize: 14, lineHeight: 1.4 }}>
        {t('events.share.howToShare')}
      </p>
      <code
        style={{
          display: 'block',
          padding: 'var(--s-2)',
          background: 'var(--paper)',
          border: '1px solid var(--hair)',
          margin: '0 0 var(--s-3)',
          fontSize: 13,
          fontFamily: 'var(--font-mono, monospace)',
          color: 'var(--ink)',
          overflowWrap: 'anywhere',
        }}
      >
        {shareUrl}
      </code>
      <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => void handleCopy()}
          style={{
            background: 'var(--accent)',
            color: 'var(--paper)',
            border: 'none',
            padding: '8px 16px',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t('events.share.copy')}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="mono-meta"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--ink-3)',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {t('events.share.dismiss')}
        </button>
      </div>
    </section>
  );
}

function ParticipantList({ participants }: { participants: EventParticipant[] }) {
  const { t } = useI18n();
  return (
    <details style={{ marginTop: 'var(--s-4)' }}>
      <summary
        className="mono-meta"
        style={{ color: 'var(--ink-3)', cursor: 'pointer' }}
      >
        {t('events.participants.title')} · {participants.length}
      </summary>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 'var(--s-3) 0 0',
        }}
      >
        {participants.map((p) => (
          <li
            key={p.user_id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--s-3)',
              padding: 'var(--s-2) 0',
              borderBottom: '1px solid var(--hair)',
            }}
          >
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 14 }}>
              {p.display_name}
            </span>
            <span
              className="mono-meta"
              style={{
                fontSize: 12,
                color:
                  p.status === 'active'
                    ? 'var(--accent)'
                    : p.status === 'pending'
                      ? 'var(--ink-3)'
                      : 'var(--accent-deep)',
              }}
            >
              {t(`events.participants.status${capitalize(p.status)}` as never)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
