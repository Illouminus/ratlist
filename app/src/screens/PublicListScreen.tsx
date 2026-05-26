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
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useI18n } from '../i18n/useI18n';
import { PaperLayout } from '../components/PaperLayout';
import { ItemPhoto } from '../components/ItemPhoto';
import { OccasionTag } from '../components/OccasionTag';
import { LangToggle } from '../components/LangToggle';
import { ReportDialog } from '../components/ReportDialog';
import { SittingRat } from '../components/rats';
import { groupByPriority } from '../items/groupByPriority';
import { PrioritySectionHeader } from '../components/PrioritySectionHeader';
import type { Occasion } from '../lib/db';

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
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; owner: PublicOwner; items: PublicItem[] }
  | { kind: 'invalid' }
  | { kind: 'error'; message: string };

export function PublicListScreen() {
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
        if (!owner) {
          setState({ kind: 'invalid' });
          return;
        }
        setState({ kind: 'ready', owner, items });
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
        <p style={{ color: 'var(--accent-deep)' }}>{state.message}</p>
      )}

      {state.kind === 'ready' && <Body owner={state.owner} items={state.items} />}

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
        <div>
          {groupByPriority(items).map((section) =>
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
      )}
    </>
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
              {item.price_text}
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
