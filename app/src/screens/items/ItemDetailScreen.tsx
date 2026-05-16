/**
 * `ItemDetailScreen` — `/i/:itemId`. Single-item view of one of the
 * caller's own wishlist items. Lays out the editorial Item Detail
 * mockup from the v2 design: numbered eyebrow, 4:3 photo, italic title
 * with the price in italic on the right, occasion chip, my-note block,
 * 2×2 meta grid, and a primary "open link" + secondary actions row.
 *
 * "Edit" routes to `/i/:itemId/edit` — a sibling full-screen form —
 * rather than opening a drawer. Keeps the page chrome predictable
 * across both flows.
 *
 * Privacy: this screen only renders items the user owns. Friend-owned
 * items live on `/p/:userId` (FriendListScreen) and have their own UI
 * for claiming.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { useMyItems, type MyItem } from '../../items/useMyItems';
import { useGroups } from '../../groups/useGroups';
import { errorMessage } from '../../lib/errors';
import { PaperLayout } from '../../components/PaperLayout';
import { ItemPhoto } from '../../components/ItemPhoto';
import { OccasionTag } from '../../components/OccasionTag';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { SittingRat } from '../../components/rats';
import type { Occasion } from '../../lib/db';

/** ISO -> human "Apr 12" / "12 апр". Mirrors the eyebrow in the mockup. */
function formatAdded(iso: string, lang: 'ru' | 'en'): string {
  const d = new Date(iso);
  const locale = lang === 'ru' ? 'ru-RU' : 'en-GB';
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/** Index of the item within the user's list, so we can show "позиция #03"
 *  consistent with the numbered chip on the My List rows. */
function indexOf(items: MyItem[], id: string): number {
  return items.findIndex((i) => i.id === id);
}

export function ItemDetailScreen() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { itemId = '' } = useParams<{ itemId: string }>();
  const { query, deleteItem } = useMyItems();
  const { query: groupsQ } = useGroups();
  const toast = useToast();

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

  const items = query.items;
  const index = indexOf(items, itemId);
  const item = index >= 0 ? items[index] : undefined;

  if (!item) return <NotFound />;

  const number = String(index + 1).padStart(2, '0');
  const groups = groupsQ.status === 'ready' ? groupsQ.groups : [];
  const publishedGroups = groups.filter((g) => item.group_ids.includes(g.id));

  async function handleDelete(): Promise<void> {
    if (!window.confirm(t('item.confirmDelete'))) return;
    setDeleting(true);
    const result = await deleteItem(itemId);
    setDeleting(false);
    if ('error' in result) {
      setError(errorMessage(t, result.error));
      return;
    }
    navigate('/', { replace: true });
  }

  async function handleShare(): Promise<void> {
    const url = `${window.location.origin}/i/${itemId}`;
    // Use the Web Share API when available (mobile), fall back to
    // clipboard. We deliberately don't block on prompts — if the user
    // dismisses share, navigator.share rejects and we silently move on.
    if (navigator.share) {
      try {
        await navigator.share({ title: item!.title, url });
      } catch {
        /* user cancelled — nothing to do */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.show(t('item.shareCopied'));
    } catch {
      /* clipboard blocked — no fallback yet */
    }
  }

  return (
    <PaperLayout>
      <TopRow onEdit={() => navigate(`/i/${item.id}/edit`)} number={number} />

      <div
        className="mono-meta"
        style={{ marginTop: 'var(--s-4)', marginBottom: 'var(--s-3)', color: 'var(--ink-3)' }}
      >
        {t('item.eyebrowNumbered', { n: number })} · {t('item.added', {
          date: formatAdded(item.created_at, lang),
        })}
      </div>

      {/* Photo — same 4:3 wash placeholder as the list row, but full
          width and with the larger "01" badge from the v2 mockup. */}
      <div style={{ position: 'relative' }}>
        <ItemPhoto coverUrl={item.cover_url} aspectRatio="4 / 3" alt={item.title} />
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
        <OccasionTag kind={item.occasion as Occasion} />
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

      <MetaGrid item={item} publishedGroups={publishedGroups} />

      <ActionsRow
        item={item}
        onShare={() => void handleShare()}
        onDelete={() => void handleDelete()}
        deleting={deleting}
      />

      {error && (
        <p style={{ color: 'var(--accent-deep)', fontSize: 13, marginTop: 'var(--s-3)' }}>
          {error}
        </p>
      )}

      {/* Decorative rat in the bottom-right margin — keeps the page from
          feeling abrupt when the note + meta block ends with two buttons. */}
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

function TopRow({ onEdit, number }: { onEdit: () => void; number: string }) {
  const { t } = useI18n();
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
        to="/"
        className="mono-meta"
        style={{ color: 'var(--ink-2)', textDecoration: 'none' }}
      >
        {t('item.back')}
      </Link>
      <span className="mono-meta" style={{ color: 'var(--ink-3)' }}>
        #{number}
      </span>
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
  item: MyItem;
  publishedGroups: { id: string; name: string; emoji: string | null }[];
}

function MetaGrid({ item, publishedGroups }: MetaGridProps) {
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
      <div style={{ gridColumn: '1 / -1' }}>
        <MetaCell label={t('nav.groups')}>{visibility}</MetaCell>
      </div>
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
  // CHECK constraint pins priority to 1..3; default is 2. Anything
  // outside that range is impossible, but TS doesn't know — fall back
  // to "mid" so the UI always renders something.
  if (p === 1) return 'item.priorityHigh';
  if (p === 3) return 'item.priorityLow';
  return 'item.priorityMid';
}

interface ActionsRowProps {
  item: MyItem;
  onShare: () => void;
  onDelete: () => void;
  deleting: boolean;
}

function ActionsRow({ item, onShare, onDelete, deleting }: ActionsRowProps) {
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
      <Button
        variant="dark"
        onClick={onShare}
        style={{ flex: 1, minWidth: 140, padding: 12 }}
      >
        {t('item.share')}
      </Button>
      <Button
        variant="ghost"
        onClick={onDelete}
        disabled={deleting}
        style={{ color: 'var(--ink-3)', padding: '12px var(--s-3)' }}
      >
        {t('item.delete')}
      </Button>
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
