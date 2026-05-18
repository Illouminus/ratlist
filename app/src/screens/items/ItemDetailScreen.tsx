/**
 * `ItemDetailScreen` — `/i/:itemId`. Editorial single-item view that
 * works as a shareable URL.
 *
 * Two render modes (driven by `is_mine` from `useItem`):
 *
 *   - own item:      eyebrow shows the "#03" position in the caller's
 *                    list, edit + delete actions are visible, the meta
 *                    grid includes the per-group visibility row.
 *   - friend item:   eyebrow shows "из списка X" with a link back to
 *                    `/p/:ownerId`; no edit/delete; claim/release
 *                    continues to live on the friend list page.
 *
 * Mounting `useItem` lets the screen open via a typed-URL too — the
 * underlying SELECT RLS already gates whether the caller can see this
 * item; we just translate "no row" into a friendly not-found.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { useItem, type FullItem } from '../../items/useItem';
import { useMyItems } from '../../items/useMyItems';
import { useGroups } from '../../groups/useGroups';
import { usePeople } from '../../people/usePeople';
import { errorMessage } from '../../lib/errors';
import { PaperLayout } from '../../components/PaperLayout';
import { ItemPhoto } from '../../components/ItemPhoto';
import { OccasionTag } from '../../components/OccasionTag';
import { Button } from '../../components/Button';
import { useToast } from '../../components/useToast';
import { useConfirm } from '../../components/useConfirm';
import { SittingRat } from '../../components/rats';

/** ISO → "Apr 12" / "12 апр". Mirrors the eyebrow in the mockup. */
function formatAdded(iso: string, lang: 'ru' | 'en'): string {
  const d = new Date(iso);
  const locale = lang === 'ru' ? 'ru-RU' : 'en-GB';
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export function ItemDetailScreen() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { itemId = '' } = useParams<{ itemId: string }>();
  const { query } = useItem(itemId || null);
  // Only used when the item is mine (for "#03" position + delete).
  const { query: myItemsQ, deleteItem } = useMyItems();
  const { query: groupsQ } = useGroups();
  // Friend items: usePeople is already loaded for the directory; we
  // look up the owner's display name from there. Cheap reuse instead
  // of an extra profile fetch.
  const { query: peopleQ } = usePeople();
  const toast = useToast();
  const confirm = useConfirm();

  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (query.status === 'loading') {
    return (
      <PaperLayout>
        <div className="mono-meta" style={{ color: 'var(--ink-3)' }}>
          …
        </div>
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
  if (query.status === 'notFound') return <NotFound />;

  const item = query.item;
  const isMine = item.is_mine;

  // Position-in-my-list — only meaningful for own items.
  const myIndex = isMine && myItemsQ.status === 'ready'
    ? myItemsQ.items.findIndex((i) => i.id === item.id)
    : -1;
  const number = myIndex >= 0 ? String(myIndex + 1).padStart(2, '0') : null;

  const groups = groupsQ.status === 'ready' ? groupsQ.groups : [];
  const publishedGroups = groups.filter((g) => item.group_ids.includes(g.id));

  const owner =
    !isMine && peopleQ.status === 'ready'
      ? peopleQ.people.find((p) => p.id === item.owner_id)
      : null;
  const ownerName = owner?.handle ?? owner?.display_name ?? null;

  async function handleDelete(): Promise<void> {
    const ok = await confirm({
      title: t('item.confirmDeleteTitle', { title: item.title }),
      body: t('item.confirmDelete'),
      confirmLabel: t('item.delete'),
      cancelLabel: t('groups.cancel'),
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    const result = await deleteItem(itemId);
    setDeleting(false);
    if ('error' in result) {
      setError(errorMessage(t, result.error));
      return;
    }
    toast.show(t('item.deletedToast'));
    navigate('/', { replace: true });
  }

  async function handleShare(): Promise<void> {
    const url = `${window.location.origin}/i/${itemId}`;
    // Always copy + toast. We used to call navigator.share first but
    // on desktop it either silently does nothing or opens the OS
    // share sheet (macOS Big Sur+), neither of which signals to the
    // user "your link is ready". One predictable path is better.
    try {
      await navigator.clipboard.writeText(url);
      toast.show(t('item.shareCopied'));
    } catch {
      // Clipboard blocked (private mode / very old browser). Fall
      // back to the native share sheet if available, otherwise show
      // a "couldn't copy" tip so the user knows to try again.
      if (navigator.share) {
        try {
          await navigator.share({ title: item.title, url });
        } catch {
          /* user cancelled the share sheet */
        }
      }
    }
  }

  return (
    <PaperLayout>
      <TopRow
        isMine={isMine}
        ownerId={item.owner_id}
        ownerName={ownerName}
        number={number}
        onEdit={() => navigate(`/i/${item.id}/edit`)}
      />

      <div
        className="mono-meta"
        style={{ marginTop: 'var(--s-4)', marginBottom: 'var(--s-3)', color: 'var(--ink-3)' }}
      >
        {isMine && number
          ? `${t('item.eyebrowNumbered', { n: number })} · ${t('item.added', {
              date: formatAdded(item.created_at, lang),
            })}`
          : `${t('item.eyebrowFriend', { name: ownerName ?? '…' })} · ${t('item.added', {
              date: formatAdded(item.created_at, lang),
            })}`}
      </div>

      {/* Cap the photo block so it never balloons past ~520px on
          desktop. PaperLayout already centers content but ItemPhoto
          itself wants to fill the column, so we clamp here. */}
      <div style={{ position: 'relative', maxWidth: 520 }}>
        <ItemPhoto coverUrl={item.cover_url} aspectRatio="4 / 3" alt={item.title} />
        {number && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: 13,
              color: 'var(--ink)',
              background: 'rgba(250, 246, 239, 0.85)',
              padding: '1px 6px',
              letterSpacing: 0.4,
            }}
          >
            {number}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 'var(--s-5)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--s-4)',
        }}
      >
        <h1
          className="display-italic"
          style={{
            margin: 0,
            fontSize: 'var(--display-l)',
            lineHeight: 1.05,
            letterSpacing: -1,
            flex: 1,
            minWidth: 0,
            wordBreak: 'break-word',
          }}
        >
          {item.title}
        </h1>
        {item.price_text && (
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: 22,
              color: 'var(--accent)',
              whiteSpace: 'nowrap',
              marginTop: 4,
            }}
          >
            {item.price_text}
          </div>
        )}
      </div>

      {(item.maker || item.url) && (
        <div
          style={{
            marginTop: 'var(--s-1)',
            fontSize: 13,
            color: 'var(--ink-3)',
            wordBreak: 'break-word',
          }}
        >
          {item.maker && <span>{item.maker}</span>}
          {item.maker && item.url && ' · '}
          {item.url && hostname(item.url)}
        </div>
      )}

      <div style={{ marginTop: 'var(--s-4)' }}>
        <OccasionTag kind={item.occasion} />
      </div>

      {item.note && (
        <>
          <Rule top={22} bottom={18} />
          <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
            {t('item.myNote')}
          </div>
          <div
            className="display-italic"
            style={{
              fontSize: 17,
              lineHeight: 1.5,
              color: 'var(--ink)',
            }}
          >
            «{item.note}»
          </div>
        </>
      )}

      <Rule top={22} bottom={18} />

      <MetaGrid item={item} publishedGroups={publishedGroups} showVisibility={isMine} />

      <ActionsRow
        item={item}
        isMine={isMine}
        onShare={() => void handleShare()}
        onDelete={() => void handleDelete()}
        deleting={deleting}
      />

      {error && (
        <p style={{ color: 'var(--accent-deep)', fontSize: 13, marginTop: 'var(--s-3)' }}>
          {error}
        </p>
      )}

      <div
        aria-hidden
        style={{
          marginTop: 'var(--s-6)',
          display: 'flex',
          justifyContent: 'flex-end',
          opacity: 0.5,
        }}
      >
        <SittingRat size={40} />
      </div>
    </PaperLayout>
  );
}

// ─────────────────────────── parts ───────────────────────────

interface TopRowProps {
  isMine: boolean;
  ownerId: string;
  ownerName: string | null;
  number: string | null;
  onEdit: () => void;
}

function TopRow({ isMine, ownerId, ownerName, number, onEdit }: TopRowProps) {
  const { t } = useI18n();
  const backHref = isMine ? '/' : `/p/${ownerId}`;
  const backLabel = isMine
    ? t('item.back')
    : t('item.backToFriend', { name: ownerName ?? '…' });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--s-3)',
      }}
    >
      <Link
        to={backHref}
        className="mono-meta"
        style={{
          color: 'var(--ink-2)',
          textDecoration: 'none',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {backLabel}
      </Link>
      {number && (
        <span className="mono-meta" style={{ color: 'var(--ink-3)' }}>
          #{number}
        </span>
      )}
      {isMine && (
        <button
          type="button"
          onClick={onEdit}
          className="mono-meta"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--ink-2)',
            padding: 0,
          }}
        >
          {t('item.edit')}
        </button>
      )}
    </div>
  );
}

function Rule({ top, bottom }: { top: number; bottom: number }) {
  return (
    <hr
      style={{
        border: 0,
        borderTop: '1px solid var(--hair)',
        margin: `${top}px 0 ${bottom}px`,
      }}
    />
  );
}

interface MetaGridProps {
  item: FullItem;
  publishedGroups: { id: string; name: string; emoji: string | null }[];
  /** Only own-item callers see the per-group visibility row — for
   *  someone else's item that line would just leak their grouping. */
  showVisibility: boolean;
}

function MetaGrid({ item, publishedGroups, showVisibility }: MetaGridProps) {
  const { t } = useI18n();

  const visibility =
    publishedGroups.length === 0
      ? t('item.privateOnly')
      : t('item.publishedIn', {
          groups: publishedGroups
            .map((g) => `${g.emoji ? g.emoji + ' ' : ''}${g.name}`)
            .join(', '),
        });

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 'var(--s-4)',
        marginBottom: 'var(--s-5)',
      }}
    >
      {item.maker && <MetaCell label={t('item.metaMaker')}>{item.maker}</MetaCell>}
      {item.price_text && <MetaCell label={t('item.metaPrice')}>{item.price_text}</MetaCell>}
      <MetaCell label={t('item.metaOccasion')}>{t(`occasion.${item.occasion}`)}</MetaCell>
      <MetaCell label={t('item.metaPriority')}>{t(priorityKey(item.priority))}</MetaCell>
      {showVisibility && (
        <div style={{ gridColumn: '1 / -1' }}>
          <MetaCell label={t('nav.groups')}>{visibility}</MetaCell>
        </div>
      )}
    </div>
  );
}

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono-meta" style={{ fontSize: 10, marginBottom: 3 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          color: 'var(--ink)',
          fontWeight: 500,
          lineHeight: 1.35,
          wordBreak: 'break-word',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function priorityKey(p: number): string {
  // CHECK constraint pins priority to 1..3; default is 2.
  if (p === 1) return 'item.priorityHigh';
  if (p === 3) return 'item.priorityLow';
  return 'item.priorityMid';
}

interface ActionsRowProps {
  item: FullItem;
  isMine: boolean;
  onShare: () => void;
  onDelete: () => void;
  deleting: boolean;
}

function ActionsRow({ item, isMine, onShare, onDelete, deleting }: ActionsRowProps) {
  const { t } = useI18n();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-3)' }}>
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer noopener"
          style={{
            flex: 1,
            minWidth: 140,
            textAlign: 'center',
            textDecoration: 'none',
            background: 'transparent',
            color: 'var(--ink)',
            border: '1px solid var(--hair-strong)',
            padding: '12px',
            borderRadius: 'var(--r-1)',
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {t('item.openLink')}
        </a>
      )}
      <Button variant="dark" onClick={onShare} style={{ flex: 1, minWidth: 140, padding: 12 }}>
        {t('item.share')}
      </Button>
      {isMine && (
        <Button
          variant="ghost"
          onClick={onDelete}
          disabled={deleting}
          style={{ color: 'var(--ink-3)', padding: '12px var(--s-3)' }}
        >
          {t('item.delete')}
        </Button>
      )}
    </div>
  );
}

function NotFound() {
  const { t } = useI18n();
  return (
    <PaperLayout>
      <header style={{ marginBottom: 'var(--s-5)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
          {t('item.notFoundTitle')}
        </div>
        <h2
          className="display-italic"
          style={{
            fontSize: 'var(--display-m)',
            margin: 0,
            lineHeight: 1.1,
            letterSpacing: -0.8,
          }}
        >
          {t('item.notFoundBody')}
        </h2>
      </header>
      <Link to="/" className="mono-meta" style={{ color: 'var(--accent)' }}>
        {t('item.back')}
      </Link>
    </PaperLayout>
  );
}

/** Pretty hostname from a full URL — drops the protocol + leading "www."
 *  so "https://www.amazon.fr/foo" reads as "amazon.fr" in the meta line. */
function hostname(url: string): string {
  try {
    const { hostname: h } = new URL(url);
    return h.replace(/^www\./, '');
  } catch {
    return url;
  }
}
