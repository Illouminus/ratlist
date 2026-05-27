/**
 * `FriendsScreen` — directory of the caller's mutual friends (the
 * `friendships` edges, fetched via the `get_friends` RPC behind
 * `useFriends`).
 *
 * Tap a card to view that friend's list at `/p/:userId`.
 *
 * Differences from the old (group-derived) PeopleScreen:
 *   - source is `useFriends` (link-first friendship graph) instead of
 *     `usePeople` (`get_my_people`, derived from event co-participants);
 *   - header has a `+ Добавить` CTA opening `<AddFriendModal>`;
 *   - each row has an inline "убрать" action — confirm dialog →
 *     `unfriend(otherId)` RPC → toast;
 *   - a small "Отправленные приглашения" section appears above the
 *     list if `useFriendInvites` returns any pending row, with
 *     individual revoke buttons;
 *   - `last_interaction_at` is no longer rendered (the new RPC only
 *     returns `updated_at` on the profile, which is too noisy to show
 *     as «обновлено …»); event counts from `useEvents` stay so the
 *     "X событий" affordance keeps the social signal.
 *
 * Route stays at `/people` for URL stability — only the component name
 * (and the data source under it) has moved.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { useFriends } from '../../friends/useFriends';
import { useFriendInvites, type PendingInvite } from '../../friends/useFriendInvites';
import { useEvents } from '../../events/useEvents';
import { errorMessage } from '../../lib/errors';
import { PaperLayout } from '../../components/PaperLayout';
import { SittingRat } from '../../components/rats';
import { ListSkeleton } from '../../components/Skeleton';
import { AddFriendModal } from '../../components/AddFriendModal';
import { useConfirm } from '../../components/useConfirm';
import { useToast } from '../../components/useToast';
import type { Database } from '../../types/database';

type Friend = Database['public']['Functions']['get_friends']['Returns'][number];

export function FriendsScreen() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const { state, unfriend } = useFriends();
  const { state: invitesState, revoke } = useFriendInvites();
  const { query: eventsQ } = useEvents();
  const [showAdd, setShowAdd] = useState(false);

  // Same memo as the old screen: count this friend's events that the
  // caller can see (skip events I'm honoree on — those are mine), so
  // FriendRow doesn't have to spin up its own hook per row.
  const eventCountByUser = useMemo(() => {
    const m = new Map<string, number>();
    if (eventsQ.status === 'ready') {
      for (const e of eventsQ.events) {
        if (e.my_status === 'honoree') continue;
        m.set(e.honoree_id, (m.get(e.honoree_id) ?? 0) + 1);
      }
    }
    return m;
  }, [eventsQ]);

  async function handleUnfriend(friend: Friend): Promise<void> {
    const ok = await confirm({
      title: t('friends.unfriendConfirm', { name: friend.display_name }),
      confirmLabel: t('friends.unfriend'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    const result = await unfriend(friend.id);
    if (!result.ok) {
      toast.show(errorMessage(t, result.message));
      return;
    }
    toast.show(t('friends.unfriendDone'));
  }

  async function handleRevoke(invite: PendingInvite): Promise<void> {
    const ok = await confirm({
      title: t('friends.revokeConfirm', { email: invite.to_email }),
      confirmLabel: t('friends.revoke'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    const result = await revoke(invite.token);
    if (!result.ok) {
      toast.show(errorMessage(t, result.message));
    }
  }

  const pendingInvites =
    invitesState.kind === 'loaded' ? invitesState.invites : [];

  return (
    <PaperLayout>
      <header style={{ position: 'relative', marginBottom: 'var(--s-5)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
          {t('people.eyebrow')}
        </div>
        <h2
          className="display-italic"
          style={{
            fontSize: 'var(--display-l)',
            margin: 0,
            lineHeight: 1.02,
            letterSpacing: -1.2,
            paddingRight: 56,
            whiteSpace: 'pre-line',
          }}
        >
          {t('friends.title')}
        </h2>
        <p
          className="marginalia"
          style={{
            fontSize: 18,
            color: 'var(--accent)',
            marginTop: 'var(--s-2)',
            transform: 'rotate(-1.5deg)',
            display: 'inline-block',
          }}
        >
          {t('people.annotation')}
        </p>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 8,
            right: 0,
            opacity: 0.7,
            pointerEvents: 'none',
          }}
        >
          <SittingRat size={40} />
        </div>
      </header>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--s-3)',
          marginBottom: 'var(--s-4)',
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-2)',
            margin: 0,
            maxWidth: 560,
            lineHeight: 1.55,
          }}
        >
          {t('people.sub')}
        </p>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="mono-meta"
          style={{
            background: 'var(--ink)',
            color: 'var(--paper)',
            border: 'none',
            padding: '8px 14px',
            borderRadius: 'var(--r-2)',
            cursor: 'pointer',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          + {t('friends.addCta')}
        </button>
      </div>

      {pendingInvites.length > 0 && (
        <PendingInvitesSection invites={pendingInvites} onRevoke={handleRevoke} />
      )}

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '0 0 var(--s-2)' }} />

      {state.kind === 'loading' && <ListSkeleton rows={4} />}
      {state.kind === 'error' && (
        <p style={{ color: 'var(--accent-deep)' }}>{errorMessage(t, state.message)}</p>
      )}
      {state.kind === 'loaded' && state.friends.length === 0 && <EmptyState />}
      {state.kind === 'loaded' && state.friends.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {state.friends.map((f) => (
            <FriendRow
              key={f.id}
              friend={f}
              eventCount={eventCountByUser.get(f.id) ?? 0}
              onUnfriend={() => handleUnfriend(f)}
            />
          ))}
        </ul>
      )}

      <AddFriendModal open={showAdd} onClose={() => setShowAdd(false)} />
    </PaperLayout>
  );
}

// ─────────────────────────── pending invites ───────────────────────────

interface PendingInvitesSectionProps {
  invites: PendingInvite[];
  onRevoke: (invite: PendingInvite) => Promise<void>;
}

/**
 * Small section above the friends list — only renders when there's at
 * least one pending row. Editorial vibe: hairline separator, plain
 * type list, discreet revoke link per row. Deliberately not a card.
 */
function PendingInvitesSection({ invites, onRevoke }: PendingInvitesSectionProps) {
  const { t } = useI18n();
  return (
    <section
      style={{
        marginBottom: 'var(--s-5)',
        paddingBottom: 'var(--s-4)',
        borderBottom: '1px solid var(--hair)',
      }}
    >
      <div
        className="mono-meta"
        style={{ marginBottom: 'var(--s-3)', color: 'var(--ink-2)' }}
      >
        {t('friends.pendingTitle')}
      </div>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-2)',
        }}
      >
        {invites.map((invite) => (
          <li
            key={invite.token}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 'var(--s-3)',
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: 'var(--ink)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                flex: 1,
              }}
            >
              {invite.to_email}
            </span>
            <button
              type="button"
              onClick={() => {
                void onRevoke(invite);
              }}
              className="mono-meta"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-deep)',
                padding: 0,
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                fontSize: 12,
              }}
            >
              {t('friends.revoke')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─────────────────────────── friend row ───────────────────────────

interface FriendRowProps {
  friend: Friend;
  eventCount: number;
  onUnfriend: () => void;
}

function FriendRow({ friend, eventCount, onUnfriend }: FriendRowProps) {
  const { t } = useI18n();
  // The link target keeps the URL stable (`/p/:userId`); the row layout
  // matches the old PeopleScreen so muscle memory carries over. The
  // unfriend action sits as a discreet trailing button — one menu item
  // didn't warrant a kebab popover, and the plan explicitly allowed an
  // inline link as the alternative.
  const headline = friend.handle ? `${friend.handle}'s list` : friend.display_name;

  return (
    <li
      style={{
        borderBottom: '1px solid var(--hair)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s-3)',
      }}
    >
      <Link
        to={`/p/${friend.id}`}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-4)',
          padding: 'var(--s-4) 0',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <Avatar name={friend.display_name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            className="display-italic"
            style={{
              margin: 0,
              fontSize: 'var(--display-xs)',
              lineHeight: 1.1,
              color: 'var(--ink)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {headline}
          </h3>
          {eventCount > 0 && (
            <div
              style={{
                marginTop: 4,
                display: 'flex',
                alignItems: 'baseline',
                gap: 'var(--s-3)',
                flexWrap: 'wrap',
              }}
            >
              <span
                className="mono-meta"
                style={{ color: 'var(--accent)', fontWeight: 600 }}
              >
                {t('people.eventCount', { count: String(eventCount) })}
              </span>
            </div>
          )}
        </div>
      </Link>
      <button
        type="button"
        onClick={onUnfriend}
        className="mono-meta"
        aria-label={t('friends.unfriend')}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--ink-3)',
          padding: 'var(--s-3) var(--s-2)',
          cursor: 'pointer',
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {t('friends.unfriend')}
      </button>
    </li>
  );
}

// ─────────────────────────── empty / avatar ───────────────────────────

function EmptyState() {
  const { t } = useI18n();
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
          {t('friends.empty')}
        </p>
      </div>
      <div style={{ opacity: 0.85 }}>
        <SittingRat size={72} signText="alone?" />
      </div>
    </section>
  );
}

/** Simple circular initial badge in the accent wash colour. */
function Avatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      style={{
        width: 40,
        height: 40,
        flexShrink: 0,
        borderRadius: '50%',
        background: 'var(--accent-wash)',
        color: 'var(--ink)',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'var(--font-display)',
        fontStyle: 'italic',
        fontWeight: 500,
        fontSize: 18,
        boxShadow: 'inset 0 0 0 1px var(--hair-strong)',
      }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
