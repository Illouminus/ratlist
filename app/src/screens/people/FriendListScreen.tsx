/**
 * `FriendListScreen` — view a single friend's wishlist at `/p/:userId`.
 *
 * The recipient (the friend) does NOT see this page's coordination
 * features: claims are hidden from owners by RLS. Everyone else who
 * shares a group with them can see the list AND who's claiming what.
 *
 * UI:
 *   - editorial header with their name + a marginalia annotation
 *   - claim-hint copy
 *   - table of items; each row shows price + occasion + the right
 *     coordination control:
 *       · unclaimed → "I'll get it" button
 *       · claimed by someone else → their name (strikethrough item)
 *       · claimed by you → "you're getting it" + release button
 */
import { useParams } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { useFriendList, type ClaimWithUser, type FriendItem } from '../../people/useFriendList';
import { useI18n } from '../../i18n/useI18n';
import type { Occasion } from '../../lib/db';
import { PaperLayout } from '../../components/PaperLayout';
import { ItemPhoto } from '../../components/ItemPhoto';
import { OccasionTag } from '../../components/OccasionTag';
import { Button } from '../../components/Button';
import { SittingRat, RunningRat } from '../../components/rats';

const COLUMNS = '64px 1fr 180px 130px 90px 130px';

export function FriendListScreen() {
  const { t } = useI18n();
  const { userId } = useParams<{ userId: string }>();
  const { query, claim, release } = useFriendList(userId ?? null);
  const { user: me } = useAuth();

  return (
    <PaperLayout>

      {query.status === 'loading' && (
        <div className="mono-meta" style={{ color: 'var(--ink-3)' }}>
          …
        </div>
      )}

      {query.status === 'error' && (
        <section>
          <p style={{ color: 'var(--accent-deep)' }}>{t('friend.notFound')}</p>
        </section>
      )}

      {query.status === 'ready' && (
        <>
          <Header displayName={query.profile.display_name} />

          <p
            style={{
              fontSize: 13,
              color: 'var(--ink-2)',
              lineHeight: 1.55,
              maxWidth: 560,
              marginBottom: 'var(--s-6)',
            }}
          >
            {t('friend.claimHint')}
          </p>

          {query.items.length === 0 ? (
            <EmptyState />
          ) : (
            <ItemsTable
              items={query.items}
              myUserId={me?.id ?? null}
              onClaim={(id) => void claim(id)}
              onRelease={(id) => void release(id)}
            />
          )}
        </>
      )}
    </PaperLayout>
  );
}

// ─────────────────────────── header ───────────────────────────

function Header({ displayName }: { displayName: string }) {
  const { t } = useI18n();
  return (
    <div style={{ marginBottom: 'var(--s-5)' }}>
      <div className="mono-meta" style={{ marginBottom: 'var(--s-3)' }}>
        {t('friend.eyebrow')}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-4)', flexWrap: 'wrap' }}>
        <h2
          className="display-italic"
          style={{ fontSize: 44, margin: 0, lineHeight: 1.05, letterSpacing: -1.4 }}
        >
          {displayName}
        </h2>
        <div
          className="marginalia"
          style={{
            fontSize: 20,
            color: 'var(--accent)',
            transform: 'rotate(-2deg)',
            marginBottom: 6,
          }}
        >
          {t('friend.annotation')}
        </div>
      </div>
      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: 'var(--s-5) 0 0' }} />
    </div>
  );
}

// ─────────────────────────── table ───────────────────────────

interface ItemsTableProps {
  items: FriendItem[];
  myUserId: string | null;
  onClaim: (itemId: string) => void;
  onRelease: (itemId: string) => void;
}

function ItemsTable({ items, myUserId, onClaim, onRelease }: ItemsTableProps) {
  const { t } = useI18n();
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: COLUMNS,
          gap: 'var(--s-4)',
          padding: '0 0 var(--s-3)',
          borderBottom: '1px solid var(--hair-strong)',
        }}
      >
        {['', t('list.item'), t('list.maker'), 'occasion', t('list.price'), ''].map((h, i) => (
          <div
            key={i}
            className="mono-meta"
            style={{ fontSize: 10, textAlign: i === 4 ? 'right' : 'left' }}
          >
            {h}
          </div>
        ))}
      </div>

      {items.map((item) => (
        <FriendItemRow
          key={item.id}
          item={item}
          myUserId={myUserId}
          onClaim={() => onClaim(item.id)}
          onRelease={() => onRelease(item.id)}
        />
      ))}
      {/* a small rat trailing the table */}
      {items.length > 0 && (
        <div
          aria-hidden
          style={{
            marginTop: 'var(--s-6)',
            display: 'flex',
            justifyContent: 'flex-end',
            opacity: 0.5,
            pointerEvents: 'none',
          }}
        >
          <RunningRat size={36} flip />
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
}

function FriendItemRow({ item, myUserId, onClaim, onRelease }: FriendItemRowProps) {
  const myClaim = myUserId ? item.claims.find((c) => c.user_id === myUserId) : undefined;
  const othersClaim = item.claims.find((c) => c.user_id !== myUserId);
  const isClaimed = item.claims.length > 0;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: COLUMNS,
        gap: 'var(--s-4)',
        padding: 'var(--s-4) 0',
        alignItems: 'center',
        borderBottom: '1px solid var(--hair)',
        opacity: isClaimed && !myClaim ? 0.55 : 1,
      }}
    >
      <div style={{ width: 64, height: 48 }}>
        <ItemPhoto coverUrl={item.cover_url} height={48} alt={item.title} />
      </div>

      <div>
        <div
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: 'var(--ink)',
            textDecoration: isClaimed && !myClaim ? 'line-through' : 'none',
          }}
        >
          {item.title}
        </div>
        {item.note && (
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{item.note}</div>
        )}
      </div>

      <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{item.maker ?? ''}</div>

      <div>
        <OccasionTag kind={item.occasion as Occasion} />
      </div>

      <div
        style={{
          textAlign: 'right',
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontWeight: 500,
          fontSize: 16,
          color: 'var(--accent)',
        }}
      >
        {item.price_text ?? ''}
      </div>

      <div style={{ textAlign: 'right' }}>
        <ClaimControl
          myClaim={myClaim ?? null}
          othersClaim={othersClaim ?? null}
          onClaim={onClaim}
          onRelease={onRelease}
        />
      </div>
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

  if (myClaim) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <span
          className="marginalia"
          style={{ fontSize: 14, color: 'var(--accent)', transform: 'rotate(-1deg)' }}
        >
          {t('friend.youClaim')} ✓
        </span>
        <button
          type="button"
          onClick={onRelease}
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
          transform: 'rotate(-1deg)',
          display: 'inline-block',
        }}
      >
        {t('friend.claimedBy', { name: othersClaim.user.display_name })}
      </span>
    );
  }

  return (
    <Button
      variant="ghost"
      onClick={onClaim}
      style={{
        color: 'var(--ink)',
        border: '1px solid var(--ink)',
        padding: '5px 12px',
        textTransform: 'uppercase',
      }}
    >
      {t('friend.claim')}
    </Button>
  );
}

// ─────────────────────────── empty ───────────────────────────

function EmptyState() {
  const { t } = useI18n();
  return (
    <section
      style={{
        padding: 'var(--s-6) 0',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--s-6)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <p className="display-italic" style={{ fontSize: 22, color: 'var(--ink-2)' }}>
          {t('friend.emptyList')}
        </p>
        <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('friend.emptyListBody')}</p>
      </div>
      <div style={{ opacity: 0.85 }}>
        <SittingRat size={72} />
      </div>
    </section>
  );
}
