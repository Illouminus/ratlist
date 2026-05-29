/**
 * `PublicListScreen` — `/share/:token`. Anonymous, read-only render of
 * someone's wishlist via the share-token mechanism.
 *
 * This is NOT a logged-in route: viewers can land here without an
 * account. The page calls `get_public_list(token)` (SECURITY DEFINER)
 * which gates by token validity; if the owner has disabled or rotated
 * sharing the RPC raises `invite_not_found` and we render the "link
 * not working" empty state.
 *
 * No claim, no edit, no privacy concerns about the owner — they
 * explicitly enabled sharing and chose what status='active' items to
 * keep on their list.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useI18n } from '../i18n/useI18n';
import { useAuth } from '../auth/useAuth';
import { useToast } from '../components/useToast';
import { errorMessage } from '../lib/errors';
import { Button } from '../components/Button';
import { PaperLayout } from '../components/PaperLayout';
import { ItemPhoto } from '../components/ItemPhoto';
import { OccasionTag } from '../components/OccasionTag';
import { LangToggle } from '../components/LangToggle';
import { ReportDialog } from '../components/ReportDialog';
import { SittingRat } from '../components/rats';
import { groupByPriority } from '../items/groupByPriority';
import { PrioritySectionHeader } from '../components/PrioritySectionHeader';
import { PriorityDots } from '../components/PriorityDots';
import type { Occasion } from '../lib/db';
import { formatPrice } from '../lib/formatPrice';
import { useViewMode } from '../lib/useViewMode';
import { useSortMode } from '../lib/useSortMode';
import { sortItems } from '../lib/sortItems';
import { ViewToggle } from '../components/ViewToggle';
import { SortSelector } from '../components/SortSelector';
import { CategoryChips } from '../components/CategoryChips';

/** Local filter state for the category chip row. `'all'` = no filter,
 *  `null` = uncategorised-only, a string = match that exact category. */
type CategoryFilter = string | null | 'all';

interface PublicOwner {
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
}

interface PublicItem {
  id: string;
  title: string;
  priority: number;
  maker: string | null;
  url: string | null;
  price_text: string | null;
  occasion: string;
  note: string | null;
  cover_url: string | null;
  created_at: string;
  /**
   * Freeform category, null = "Uncategorised". As of the
   * `20260527171213_get_public_list_visibility_and_category` migration
   * the `public_item` composite carries this field, so the
   * `<CategoryChips>` row activates as soon as the owner has at least
   * one categorised public item (gated below by `items.some(i => i.category)`).
   */
  category: string | null;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; owner: PublicOwner; items: PublicItem[]; ownerId: string | null }
  | { kind: 'invalid' }
  | { kind: 'error'; message: string };

export function PublicListScreen() {
  const { t } = useI18n();
  const { token } = useParams<{ token: string }>();
  // Initial state derived from token presence — avoids a setState in
  // an effect just to push the component into `invalid`.
  const [state, setState] = useState<State>(() =>
    token ? { kind: 'loading' } : { kind: 'invalid' },
  );

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    void supabase
      .rpc('get_public_list', { _token: token })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // The RPC raises `invite_not_found` when the token doesn't
          // resolve — translate to the friendly "link not working"
          // state. Any other error falls through to a raw message.
          if (error.message.includes('invite_not_found')) {
            setState({ kind: 'invalid' });
            return;
          }
          setState({ kind: 'error', message: error.message });
          return;
        }
        // RPC returns a single row with { owner, items } columns.
        const row = Array.isArray(data) ? data[0] : null;
        if (!row || typeof row !== 'object') {
          setState({ kind: 'invalid' });
          return;
        }
        const owner = (row as { owner?: PublicOwner }).owner ?? null;
        const items = (row as { items?: PublicItem[] }).items ?? [];
        const ownerId = (row as { owner_id?: string }).owner_id ?? null;
        if (!owner) {
          setState({ kind: 'invalid' });
          return;
        }
        setState({ kind: 'ready', owner, items, ownerId });
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <PaperLayout>
      <TopRow />

      {state.kind === 'loading' && (
        <div className="mono-meta" style={{ color: 'var(--ink-3)' }}>
          …
        </div>
      )}

      {state.kind === 'invalid' && <Invalid />}

      {state.kind === 'error' && (
        <p style={{ color: 'var(--accent-deep)' }}>{errorMessage(t, state.message)}</p>
      )}

      {state.kind === 'ready' && <Body owner={state.owner} items={state.items} />}

      {state.kind === 'ready' && token && (
        <ConversionCta token={token} owner={state.owner} ownerId={state.ownerId} />
      )}

      {token && <Footer token={token} />}
    </PaperLayout>
  );
}

// ─────────────────────────── parts ───────────────────────────

function TopRow() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginBottom: 'var(--s-5)',
      }}
    >
      <LangToggle />
    </div>
  );
}

function Body({ owner, items }: { owner: PublicOwner; items: PublicItem[] }) {
  const { t } = useI18n();
  const headlineName = owner.handle ?? owner.display_name ?? t('publicList.headlineFallback');

  return (
    <>
      <header style={{ marginBottom: 'var(--s-5)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
          {t('publicList.eyebrow')}
        </div>
        <h1
          className="display-italic"
          style={{
            fontSize: 'var(--display-l)',
            margin: 0,
            lineHeight: 1.02,
            letterSpacing: -1.2,
          }}
        >
          {owner.handle ? `${owner.handle}${t('publicList.headlineSuffix')}` : headlineName}
        </h1>
        <p
          className="marginalia"
          style={{
            margin: 'var(--s-2) 0 0',
            fontSize: 18,
            color: 'var(--accent)',
            transform: 'rotate(-1.5deg)',
            display: 'inline-block',
          }}
        >
          {t('publicList.annotation')}
        </p>
      </header>

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '0 0 var(--s-4)' }} />

      {items.length === 0 ? (
        <EmptyOwner />
      ) : (
        <ItemsView items={items} />
      )}
    </>
  );
}

function ItemsView({ items }: { items: PublicItem[] }) {
  const { t } = useI18n();
  const [view, setView] = useViewMode();
  const [sort, setSort] = useSortMode();
  const [category, setCategory] = useState<CategoryFilter>('all');

  // Collapse the active filter to 'all' when its category isn't present
  // in the loaded items — purely a render-time fix-up so the chip row
  // never shows a "ghost" active chip. Project convention bans
  // setState-in-effect; we don't write back into state.
  const effectiveCategory = useMemo<CategoryFilter>(() => {
    if (category === 'all') return 'all';
    if (category === null) {
      return items.some((i) => !i.category) ? null : 'all';
    }
    return items.some((i) => i.category === category) ? category : 'all';
  }, [items, category]);

  // For chip derivation we only need the `category` field — keep this
  // tight to the chip component's contract.
  const itemsForChips = useMemo(
    () => items.map((i) => ({ category: i.category })),
    [items],
  );

  const visibleItems = useMemo(() => {
    if (effectiveCategory === 'all') return items;
    if (effectiveCategory === null) return items.filter((i) => !i.category);
    return items.filter((i) => i.category === effectiveCategory);
  }, [items, effectiveCategory]);

  const sorted = sortItems(visibleItems, sort);

  return (
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
      {/* Category chips only render when at least one item carries a
          non-null category. The `get_public_list` RPC carries the
          column as of the visibility+category migration (2026-05-27);
          the row is data-driven from there on. */}
      {items.some((i) => i.category) && (
        <div style={{ marginBottom: 'var(--s-4)' }}>
          <CategoryChips
            items={itemsForChips}
            active={effectiveCategory}
            onChange={setCategory}
          />
        </div>
      )}
      {view === 'grid' ? (
        <ItemsGrid items={sorted} />
      ) : sort === 'priority' ? (
        <div>
          {groupByPriority(sorted).map((section) =>
            section.items.length === 0 ? null : (
              <section key={section.level}>
                <PrioritySectionHeader level={section.level} count={section.items.length} />
                {section.items.map((item, i) => (
                  <Row
                    key={item.id}
                    item={item}
                    index={i}
                    last={i === section.items.length - 1}
                  />
                ))}
              </section>
            ),
          )}
        </div>
      ) : (
        // Non-priority sort: flat list, no section headers — the sort
        // already imposes the order the user picked.
        <div>
          {sorted.map((item, i) => (
            <Row key={item.id} item={item} index={i} last={i === sorted.length - 1} />
          ))}
        </div>
      )}
      {visibleItems.length === 0 && (
        <p
          style={{
            color: 'var(--ink-3)',
            marginTop: 'var(--s-4)',
            fontStyle: 'italic',
          }}
        >
          {t('list.noneForFilter')}
        </p>
      )}
    </>
  );
}

/**
 * Grid view of the public list — flat, no section headers (the
 * per-tile priority dot carries the signal). Items arrive pre-sorted
 * by the parent according to the current `SortMode`. Mirrors the
 * FriendList grid tile layout minus the claim affordance.
 */
function ItemsGrid({ items }: { items: PublicItem[] }) {
  return (
    <div className="items-grid-responsive">
      {items.map((item) => (
        <PublicItemTile key={item.id} item={item} />
      ))}
    </div>
  );
}

function PublicItemTile({ item }: { item: PublicItem }) {
  return (
    <article style={{ color: 'inherit' }}>
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
      </div>
    </article>
  );
}

function EmptyOwner() {
  const { t } = useI18n();
  return (
    <section
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--s-6)',
        flexWrap: 'wrap',
        padding: 'var(--s-5) 0',
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <p
          className="display-italic"
          style={{ fontSize: 'var(--display-s)', color: 'var(--ink-2)', margin: 0 }}
        >
          {t('publicList.empty')}
        </p>
        <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 'var(--s-2)' }}>
          {t('publicList.emptyBody')}
        </p>
      </div>
      <div style={{ opacity: 0.85 }}>
        <SittingRat size={72} />
      </div>
    </section>
  );
}

const CLAMP_2_LINES = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
} as const;

/** A single item row. Mirrors the My-list row layout but without any
 *  actions (no edit/cross-off/claim — this is public view-only). */
function Row({ item, index, last }: { item: PublicItem; index: number; last: boolean }) {
  return (
    <div
      style={{
        position: 'relative',
        padding: 'var(--s-4) 0',
        borderBottom: last ? 'none' : '1px solid var(--hair)',
        display: 'flex',
        gap: 'var(--s-4)',
        minHeight: 124,
      }}
    >
      <div style={{ width: 88, flexShrink: 0, position: 'relative' }}>
        <ItemPhoto coverUrl={item.cover_url} aspectRatio="4 / 3" alt={item.title} />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 11,
            color: 'var(--ink)',
            background: 'rgba(250, 246, 239, 0.85)',
            padding: '0 4px',
            letterSpacing: 0.4,
          }}
        >
          {String(index + 1).padStart(2, '0')}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 'var(--s-2)',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--ink)',
              lineHeight: 1.25,
              flex: 1,
              minWidth: 0,
              ...CLAMP_2_LINES,
            }}
          >
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {item.title}
              </a>
            ) : (
              item.title
            )}
          </h3>
          {item.price_text && (
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontWeight: 500,
                fontSize: 16,
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
              marginTop: 2,
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

        <div style={{ marginTop: 'auto', paddingTop: 'var(--s-2)' }}>
          <OccasionTag kind={item.occasion as Occasion} />
        </div>
      </div>
    </div>
  );
}

function Invalid() {
  const { t } = useI18n();
  return (
    <section style={{ paddingTop: 'var(--s-4)' }}>
      <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
        {t('publicList.invalidTitle')}
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
        {t('publicList.invalidBody')}
      </h2>
      <div style={{ marginTop: 'var(--s-5)', opacity: 0.6 }}>
        <SittingRat size={72} />
      </div>
    </section>
  );
}

// ─────────────────────────── conversion CTA ───────────────────────────

/**
 * The growth hook. A share page used to dead-end at the "powered by"
 * footer; now every viewer gets a next step:
 *   - anonymous → "make your own list" (the signup funnel)
 *   - logged-in non-owner → "add {owner} as a rat" (befriend_via_share),
 *     closing the social loop, then a deep-link into the in-app view
 *   - logged-in owner → a quiet "this is your list · edit" line
 */
function ConversionCta({
  token,
  owner,
  ownerId,
}: {
  token: string;
  owner: PublicOwner;
  ownerId: string | null;
}) {
  const { t } = useI18n();
  const { status, user } = useAuth();
  const toast = useToast();
  const [befriended, setBefriended] = useState(false);
  const [busy, setBusy] = useState(false);

  const ownerName = owner.handle ?? owner.display_name ?? t('publicList.headlineFallback');

  async function addOwner(): Promise<void> {
    setBusy(true);
    const { error } = await supabase.rpc('befriend_via_share', { _share_token: token });
    setBusy(false);
    if (error) {
      toast.show(errorMessage(t, error));
      return;
    }
    setBefriended(true);
    toast.show(t('publicList.addedToast', { name: ownerName }));
  }

  // Auth state still resolving — render nothing rather than flash the
  // anonymous CTA at a logged-in owner/friend for a frame.
  if (status === 'loading') return null;

  // Anonymous → the signup funnel. The promise stays literal: sign in,
  // land on your own (empty) list, where the empty state nudges item #1.
  if (status === 'anonymous') {
    return (
      <CtaShell>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-2)', color: 'var(--ink-2)' }}>
          {t('publicList.ctaEyebrow')}
        </div>
        <h2
          className="display-italic"
          style={{ margin: 0, fontSize: 'var(--display-m)', lineHeight: 1.05, letterSpacing: -1 }}
        >
          {t('publicList.makeYourOwn')}
        </h2>
        <p
          style={{
            margin: 'var(--s-2) auto var(--s-4)',
            fontSize: 14,
            color: 'var(--ink-2)',
            lineHeight: 1.55,
            maxWidth: 420,
          }}
        >
          {t('publicList.makeYourOwnBody')}
        </p>
        <Link to="/login" style={{ textDecoration: 'none' }}>
          <Button variant="dark" style={{ padding: '14px 28px', fontSize: 13 }}>
            {t('publicList.makeYourOwnCta')}
          </Button>
        </Link>
      </CtaShell>
    );
  }

  // Owner viewing their own share page — no befriend affordance.
  if (user && ownerId && user.id === ownerId) {
    return (
      <section
        style={{ marginTop: 'var(--s-6)', paddingTop: 'var(--s-4)', borderTop: '1px solid var(--hair)' }}
      >
        <span className="mono-meta" style={{ color: 'var(--ink-3)' }}>
          {t('publicList.yourList')}{' '}
        </span>
        <Link to="/" className="mono-meta" style={{ color: 'var(--accent)' }}>
          {t('publicList.yourListCta')}
        </Link>
      </section>
    );
  }

  // Logged-in non-owner, just connected this session.
  if (befriended && ownerId) {
    return (
      <CtaShell>
        <h2
          className="display-italic"
          style={{ margin: '0 0 var(--s-3)', fontSize: 'var(--display-s)', lineHeight: 1.1, letterSpacing: -0.5 }}
        >
          {t('publicList.addedOwner', { name: ownerName })}
        </h2>
        <Link to={`/p/${ownerId}`} style={{ textDecoration: 'none' }}>
          <Button variant="primary">{t('publicList.openList')}</Button>
        </Link>
      </CtaShell>
    );
  }

  // Logged-in non-owner — offer to connect.
  return (
    <CtaShell>
      <p
        style={{
          margin: '0 auto var(--s-4)',
          fontSize: 14,
          color: 'var(--ink-2)',
          lineHeight: 1.55,
          maxWidth: 420,
        }}
      >
        {t('publicList.addOwnerBody', { name: ownerName })}
      </p>
      <Button
        variant="dark"
        onClick={addOwner}
        disabled={busy}
        style={{ padding: '14px 28px', fontSize: 13 }}
      >
        {busy ? t('publicList.addOwnerBusy') : t('publicList.addOwner', { name: ownerName })}
      </Button>
    </CtaShell>
  );
}

/** Accent-soft, centered call-to-action block — same visual language as
 *  the landing page's final CTA so crossing from a shared list into the
 *  product feels continuous. */
function CtaShell({ children }: { children: ReactNode }) {
  return (
    <section
      style={{
        marginTop: 'var(--s-7)',
        padding: 'var(--s-6) var(--s-5)',
        background: 'var(--accent-soft)',
        borderRadius: 'var(--r-3)',
        textAlign: 'center',
      }}
    >
      {children}
    </section>
  );
}

function Footer({ token }: { token: string }) {
  const { t } = useI18n();
  const [reportOpen, setReportOpen] = useState(false);
  return (
    <footer
      style={{
        marginTop: 'var(--s-7)',
        paddingTop: 'var(--s-4)',
        borderTop: '1px solid var(--hair)',
        textAlign: 'center',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'baseline',
        gap: 'var(--s-4)',
        flexWrap: 'wrap',
      }}
    >
      <Link
        to="/"
        className="marginalia"
        style={{
          fontSize: 14,
          color: 'var(--ink-3)',
          textDecoration: 'none',
        }}
      >
        {t('publicList.poweredBy')}
      </Link>
      {/* Anonymous-friendly: the report flow inserts into `reports`
          with `reporter_id` null when the caller has no session. */}
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
      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="share"
        targetId={token}
      />
    </footer>
  );
}
