/**
 * `FriendListScreen` — view a single friend's wishlist at `/p/:userId`.
 *
 * The recipient (the friend) does NOT see this page's coordination
 * features: claims are hidden from owners by RLS. Everyone else who
 * shares a group with them can see the list AND who's claiming what.
 *
 * Layout matches the editorial mobile design v2:
 *   eyebrow + italic "{handle}'s list" + Caveat annotation
 *   claim-hint copy
 *   image-row items with a square 56px photo and a claim control
 *     on the right of each row:
 *       · unclaimed       → "I'll get it" button
 *       · claimed by you  → "you're getting it" + release
 *       · claimed by them → "{name} got it ✓" (item struck through)
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { useFriendList, type ClaimWithUser, type FriendItem } from '../../people/useFriendList';
import { useEvents, type MyEvent } from '../../events/useEvents';
import { useI18n } from '../../i18n/useI18n';
import { errorMessage } from '../../lib/errors';
import type { Occasion } from '../../lib/db';
import type { Profile } from '../../lib/db';
import { PaperLayout } from '../../components/PaperLayout';
import { ItemPhoto } from '../../components/ItemPhoto';
import { OccasionTag } from '../../components/OccasionTag';
import { PriorityDots } from '../../components/PriorityDots';
import { PrioritySectionHeader } from '../../components/PrioritySectionHeader';
import { ReportDialog } from '../../components/ReportDialog';
import { SittingRat, RunningRat } from '../../components/rats';
import { groupByPriority } from '../../items/groupByPriority';
import { formatPrice } from '../../lib/formatPrice';
import { useViewMode } from '../../lib/useViewMode';
import { useSortMode } from '../../lib/useSortMode';
import { sortItems } from '../../lib/sortItems';
import { ViewToggle } from '../../components/ViewToggle';
import { SortSelector } from '../../components/SortSelector';

export function FriendListScreen() {
  const { t } = useI18n();
  const { userId } = useParams<{ userId: string }>();
  const { query, claim, release } = useFriendList(userId ?? null);
  const { query: eventsQ } = useEvents();
  const { user: me } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const [view, setView] = useViewMode();
  const [sort, setSort] = useSortMode();

  // Events of this friend that I (the viewer) can see. Only their events
  // where they're the honoree, not generic ones from get_my_events.
  const friendEvents = useMemo<MyEvent[]>(() => {
    if (!userId || eventsQ.status !== 'ready') return [];
    return eventsQ.events.filter((e) => e.honoree_id === userId && e.my_status !== 'honoree');
  }, [userId, eventsQ]);

  // Don't offer "report this user" against yourself — the route is
  // reachable via /p/<my-id>, and self-reports would just clutter the
  // moderation queue.
  const canReport = !!userId && userId !== me?.id;

  return (
    <PaperLayout>
      {query.status === 'loading' && (
        <div className="mono-meta" style={{ color: 'var(--ink-3)' }}>
          …
        </div>
      )}

      {query.status === 'error' && (
        <section>
          <p style={{ color: 'var(--accent-deep)' }}>{errorMessage(t, query.error)}</p>
        </section>
      )}

      {query.status === 'ready' && (
        <>
          <Header profile={query.profile} />

          {friendEvents.length > 0 && (
            <FriendEventsSection events={friendEvents} />
          )}

          <p
            style={{
              fontSize: 13,
              color: 'var(--ink-2)',
              lineHeight: 1.55,
              maxWidth: 560,
              marginTop: 'var(--s-4)',
              marginBottom: 'var(--s-5)',
            }}
          >
            {t('friend.claimHint')}
          </p>

          {query.items.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 'var(--s-3)',
                  flexWrap: 'wrap',
                  marginBottom: 'var(--s-3)',
                }}
              >
                <SortSelector mode={sort} onMode={setSort} />
                <ViewToggle view={view} onView={setView} />
              </div>
              {view === 'grid' ? (
                <ItemsGrid
                  items={sortItems(query.items, sort)}
                  myUserId={me?.id ?? null}
                />
              ) : (
                <ItemsList
                  items={sortItems(query.items, sort)}
                  myUserId={me?.id ?? null}
                  onClaim={(id) => void claim(id)}
                  onRelease={(id) => void release(id)}
                  flat={sort !== 'priority'}
                />
              )}
            </>
          )}

          {canReport && (
            <div
              style={{
                marginTop: 'var(--s-7)',
                paddingTop: 'var(--s-4)',
                borderTop: '1px solid var(--hair)',
                textAlign: 'center',
              }}
            >
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="mono-meta"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  color: 'var(--ink-3)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                {t('report.trigger')}
              </button>
            </div>
          )}
        </>
      )}

      {canReport && userId && (
        <ReportDialog
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="profile"
          targetId={userId}
        />
      )}
    </PaperLayout>
  );
}

// ─────────────────────────── friend's events ───────────────────────────

function FriendEventsSection({ events }: { events: MyEvent[] }) {
  const { t } = useI18n();
  return (
    <section
      style={{
        margin: 'var(--s-4) 0',
        padding: 'var(--s-4) 0',
        borderTop: '1px solid var(--hair)',
        borderBottom: '1px solid var(--hair)',
      }}
    >
      <div
        className="mono-meta"
        style={{ color: 'var(--ink-3)', marginBottom: 'var(--s-3)' }}
      >
        {t('friend.eventsLabel')}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
        {events.map((e) => (
          <li key={e.id}>
            <Link
              to={`/events/${e.id}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 'var(--s-3)',
                padding: '4px 0',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span>
                <strong style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 500, fontSize: 16 }}>
                  {e.title}
                </strong>
                <span className="mono-meta" style={{ marginLeft: 'var(--s-2)', color: 'var(--ink-3)' }}>
                  {t(`events.kind.${e.kind}`)}
                  {e.occurs_on && ` · ${formatShortDate(e.occurs_on)}`}
                </span>
              </span>
              <span className="mono-meta" style={{ color: 'var(--accent)' }}>
                {t('events.open')} →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ─────────────────────────── header ───────────────────────────

function Header({
  profile,
}: {
  profile: Pick<Profile, 'id' | 'display_name' | 'handle' | 'avatar_url'>;
}) {
  const { t } = useI18n();
  const headline = profile.handle ? `${profile.handle}'s list` : profile.display_name;

  return (
    <div style={{ marginBottom: 'var(--s-4)' }}>
      {/* Breadcrumb back to /people — the route is reachable from
          People (tap a friend) but also via shareable URL, so we
          always render the link rather than try to detect intent. */}
      <Link
        to="/people"
        className="mono-meta"
        style={{
          color: 'var(--ink-2)',
          textDecoration: 'none',
          display: 'inline-block',
          marginBottom: 'var(--s-3)',
        }}
      >
        {t('friend.backToPeople')}
      </Link>
      <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
        {profile.display_name}
        {profile.handle && profile.handle !== profile.display_name && (
          <>{' · @'}{profile.handle}</>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
        <h2
          className="display-italic"
          style={{
            margin: 0,
            fontSize: 'var(--display-l)',
            lineHeight: 1.0,
            letterSpacing: -1.2,
          }}
        >
          {headline}
        </h2>
        <div
          className="marginalia"
          style={{
            fontSize: 16,
            color: 'var(--accent)',
            transform: 'rotate(-2deg)',
            marginBottom: 4,
            display: 'inline-block',
          }}
        >
          {t('friend.annotation')}
        </div>
      </div>
      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: 'var(--s-4) 0 0' }} />
    </div>
  );
}

// ─────────────────────────── list ───────────────────────────

interface ItemsListProps {
  items: FriendItem[];
  myUserId: string | null;
  onClaim: (itemId: string) => void;
  onRelease: (itemId: string) => void;
  /** When true the list is rendered without priority section headers —
   *  e.g. when the user sorts by price or category. */
  flat?: boolean;
}

function ItemsList({ items, myUserId, onClaim, onRelease, flat = false }: ItemsListProps) {
  return (
    <div>
      {flat
        ? items.map((item, i) => (
            <FriendItemRow
              key={item.id}
              item={item}
              myUserId={myUserId}
              onClaim={() => onClaim(item.id)}
              onRelease={() => onRelease(item.id)}
              last={i === items.length - 1}
            />
          ))
        : groupByPriority(items).map((section) =>
            section.items.length === 0 ? null : (
              <section key={section.level}>
                <PrioritySectionHeader level={section.level} count={section.items.length} />
                {section.items.map((item, i) => (
                  <FriendItemRow
                    key={item.id}
                    item={item}
                    myUserId={myUserId}
                    onClaim={() => onClaim(item.id)}
                    onRelease={() => onRelease(item.id)}
                    last={i === section.items.length - 1}
                  />
                ))}
              </section>
            ),
          )}
      {/* a small rat trailing the list */}
      {items.length > 0 && (
        <div
          aria-hidden
          style={{
            marginTop: 'var(--s-5)',
            display: 'flex',
            justifyContent: 'flex-end',
            opacity: 0.5,
            pointerEvents: 'none',
          }}
        >
          <RunningRat size={32} flip />
        </div>
      )}
    </div>
  );
}

interface FriendItemRowProps {
  item: FriendItem;
  myUserId: string | null;
  onClaim: () => void;
  onRelease: () => void;
  last: boolean;
}

// ─────────────────────────── grid ───────────────────────────

interface ItemsGridProps {
  items: FriendItem[];
  myUserId: string | null;
}

/**
 * Grid view of friend's items — flat (no priority sections, the dot
 * inside each tile carries the signal). Items arrive pre-sorted by
 * the parent according to the current `SortMode`. Clicking a tile
 * opens `/i/:id` where the inline claim affordance lives; tiles
 * themselves stay browse-only to keep the grid visually uniform.
 */
function ItemsGrid({ items, myUserId }: ItemsGridProps) {
  return (
    <div className="items-grid-responsive">
      {items.map((item) => (
        <FriendItemTile key={item.id} item={item} myUserId={myUserId} />
      ))}
    </div>
  );
}

function FriendItemTile({ item, myUserId }: { item: FriendItem; myUserId: string | null }) {
  const { t } = useI18n();
  const myClaim = myUserId ? item.claims.find((c) => c.user_id === myUserId) : undefined;
  const othersClaim = item.claims.find((c) => c.user_id !== myUserId);
  const isClaimed = item.claims.length > 0;
  const dimmed = isClaimed && !myClaim;

  return (
    <Link
      to={`/i/${item.id}`}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        display: 'block',
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      <ItemPhoto coverUrl={item.cover_url} aspectRatio="4 / 3" alt={item.title} />
      <div style={{ paddingTop: 'var(--s-2)' }}>
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: 14,
            color: 'var(--ink)',
            lineHeight: 1.3,
            textDecoration: dimmed ? 'line-through' : 'none',
            ...CLAMP_2_LINES,
          }}
        >
          {item.title}
        </h3>
        {(item.maker || item.price_text) && (
          <div
            className="mono-meta"
            style={{ marginTop: 2, fontSize: 11, color: 'var(--ink-3)' }}
          >
            {[item.maker, formatPrice(item.price_text)].filter(Boolean).join(' · ')}
          </div>
        )}
        {item.note && (
          <div
            style={{
              marginTop: 4,
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
            marginTop: 'var(--s-2)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-3)',
          }}
        >
          <OccasionTag kind={item.occasion as Occasion} />
          <PriorityDots level={item.priority === 1 ? 1 : item.priority === 3 ? 3 : 2} />
        </div>
        {myClaim && (
          <div
            className="mono-meta"
            style={{ marginTop: 'var(--s-2)', fontSize: 11, color: 'var(--accent)' }}
          >
            ✓ {t('friend.youClaim')}
          </div>
        )}
        {othersClaim && !myClaim && (
          <div
            className="mono-meta"
            style={{ marginTop: 'var(--s-2)', fontSize: 11, color: 'var(--ink-3)' }}
          >
            {t('friend.claimedBy', { name: othersClaim.user.display_name })}
          </div>
        )}
      </div>
    </Link>
  );
}

/** Same line-clamp helper as in ItemList — keep rows visually even. */
const CLAMP_2_LINES = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
} as const;

const FRIEND_ROW_MIN_HEIGHT = 96;

function FriendItemRow({ item, myUserId, onClaim, onRelease, last }: FriendItemRowProps) {
  const myClaim = myUserId ? item.claims.find((c) => c.user_id === myUserId) : undefined;
  const othersClaim = item.claims.find((c) => c.user_id !== myUserId);
  const isClaimed = item.claims.length > 0;
  const dimmed = isClaimed && !myClaim;

  // The whole row is a `<Link>` to the item detail page, except for the
  // claim button which sits on top with its own click handler. We
  // prevent the link from receiving clicks that originate on the
  // claim control via `stopPropagation` inside ClaimControl below.
  return (
    <div
      style={{
        position: 'relative',
        borderBottom: last ? 'none' : '1px solid var(--hair)',
        opacity: dimmed ? 0.55 : 1,
        minHeight: FRIEND_ROW_MIN_HEIGHT,
      }}
    >
      <Link
        to={`/i/${item.id}`}
        style={{
          display: 'flex',
          gap: 'var(--s-4)',
          alignItems: 'stretch',
          padding: 'var(--s-3) 0',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <div style={{ width: 56, flexShrink: 0 }}>
          <ItemPhoto coverUrl={item.cover_url} aspectRatio="1 / 1" alt={item.title} />
        </div>

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
              gap: 'var(--s-2)',
              alignItems: 'flex-start',
            }}
          >
            <h3
              style={{
                margin: 0,
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                fontSize: 13.5,
                color: 'var(--ink)',
                lineHeight: 1.3,
                flex: 1,
                minWidth: 0,
                textDecoration: dimmed ? 'line-through' : 'none',
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
                  fontSize: 14,
                  color: 'var(--accent)',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatPrice(item.price_text)}
              </div>
            )}
          </div>

          {item.maker && (
            <div
              style={{
                marginTop: 1,
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

          {/* Owner's personal note — fun comments, sizing, where they saw
              it, etc. Same 2-line clamp + ink-2 styling as MyList row so
              the visual language stays consistent across views. */}
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
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 'var(--s-2)',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
              <OccasionTag kind={item.occasion as Occasion} />
              <PriorityDots level={item.priority === 1 ? 1 : item.priority === 3 ? 3 : 2} />
            </div>
            <ClaimControl
              myClaim={myClaim ?? null}
              othersClaim={othersClaim ?? null}
              onClaim={onClaim}
              onRelease={onRelease}
            />
          </div>
        </div>
      </Link>
    </div>
  );
}

// ─────────────────────────── claim controls ───────────────────────────

interface ClaimControlProps {
  myClaim: ClaimWithUser | null;
  othersClaim: ClaimWithUser | null;
  onClaim: () => void;
  onRelease: () => void;
}

function ClaimControl({ myClaim, othersClaim, onClaim, onRelease }: ClaimControlProps) {
  const { t } = useI18n();

  // The row itself is now a `<Link>`, so every button inside it needs
  // to stop click propagation — otherwise tapping "i'll get it" would
  // both claim *and* navigate to the detail page.
  function intercept(handler: () => void) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handler();
    };
  }

  if (myClaim) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--s-2)',
        }}
      >
        <span
          className="marginalia"
          style={{
            fontSize: 13,
            color: 'var(--accent)',
            transform: 'rotate(-1deg)',
            whiteSpace: 'nowrap',
          }}
        >
          {t('friend.youClaim')} ✓
        </span>
        <button
          type="button"
          onClick={intercept(onRelease)}
          className="mono-meta"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            color: 'var(--ink-3)',
          }}
        >
          {t('friend.release')}
        </button>
      </div>
    );
  }

  if (othersClaim) {
    return (
      <span
        className="marginalia"
        style={{
          fontSize: 14,
          color: 'var(--ink-3)',
          transform: 'rotate(-2deg)',
          display: 'inline-block',
          whiteSpace: 'nowrap',
        }}
      >
        {t('friend.claimedBy', { name: othersClaim.user.display_name })}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={intercept(onClaim)}
      style={{
        background: 'transparent',
        border: '1px solid var(--ink)',
        padding: '4px 10px',
        borderRadius: 'var(--r-1)',
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--ink)',
        whiteSpace: 'nowrap',
      }}
    >
      {t('friend.claim')}
    </button>
  );
}

// ─────────────────────────── empty ───────────────────────────

function EmptyState() {
  const { t } = useI18n();
  return (
    <section
      style={{
        padding: 'var(--s-5) 0',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--s-5)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 200 }}>
        <p
          className="display-italic"
          style={{ fontSize: 'var(--display-s)', color: 'var(--ink-2)', margin: 0 }}
        >
          {t('friend.emptyList')}
        </p>
        <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 'var(--s-2)' }}>
          {t('friend.emptyListBody')}
        </p>
      </div>
      <div style={{ opacity: 0.85 }}>
        <SittingRat size={72} />
      </div>
    </section>
  );
}
