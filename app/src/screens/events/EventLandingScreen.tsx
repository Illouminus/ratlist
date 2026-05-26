/**
 * `EventLandingScreen` — `/event/:token`. Public-facing landing page
 * reached from a coordinator's shared link or an invite email.
 *
 * Three viewer flavours, decided by the SECURITY DEFINER RPC
 * `get_event_view`:
 *   - **anon** (no JWT): render event + items grid with no claim status,
 *     plus a sign-in CTA that bounces back here after auth.
 *   - **honoree**: redirect to `/events/:id` — they already manage this
 *     event; no need for the public landing.
 *   - **anyone else (active / pending / guest)**: call
 *     `join_event_via_token` to flip pending→active (or create active)
 *     then redirect to `/events/:id` (added in task C.4).
 *
 * Mirrors `PublicListScreen` for the anon path: PaperLayout, paper/ink
 * editorial vibe, no chrome. Eager-loaded in `Router.tsx` because the
 * critical path is "click email link → see something within 200 ms".
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PaperLayout } from '../../components/PaperLayout';
import { ItemPhoto } from '../../components/ItemPhoto';
import { LangToggle } from '../../components/LangToggle';
import { PriorityDots } from '../../components/PriorityDots';
import { useI18n } from '../../i18n/useI18n';
import { useAuth } from '../../auth/useAuth';
import {
  getEventView,
  joinEventViaToken,
  type EventView,
  type EventViewItem,
} from '../../events/eventApi';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; event: EventView }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

export function EventLandingScreen() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<State>(() =>
    token ? { kind: 'loading' } : { kind: 'not_found' },
  );

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    void getEventView(token).then(
      (event) => {
        if (!cancelled) setState({ kind: 'ready', event });
      },
      (err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        if (/event_not_found/.test(message)) {
          setState({ kind: 'not_found' });
        } else {
          setState({ kind: 'error', message });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Auto-join + redirect: once the event is loaded AND there's an authed
  // user, decide where to send them by my_status. The redirect is a
  // history replace so the /event/:token page doesn't sit on the back
  // stack. Anon stays on the landing — they get the sign-in CTA. Authed
  // viewers see a brief blank under <TopRow /> while the RPC resolves —
  // the redirect typically lands within one render frame.
  useEffect(() => {
    if (state.kind !== 'ready' || !user || !token) return;
    const ev = state.event;
    if (ev.my_status === 'honoree' || ev.my_status === 'active') {
      navigate(`/events/${ev.event_id}`, { replace: true });
      return;
    }
    // guest or pending: claim a participant row, then redirect. If the
    // RPC fails, surface a generic error — the landing UI stays so the
    // visitor can retry. setState only inside .then(...) per the
    // react-hooks/set-state-in-effect convention.
    let cancelled = false;
    void joinEventViaToken(token).then(
      (eventId) => {
        if (!cancelled) navigate(`/events/${eventId}`, { replace: true });
      },
      (err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'error', message });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [state, user, token, navigate]);

  return (
    <PaperLayout>
      <TopRow />

      {state.kind === 'loading' && (
        <div className="mono-meta" style={{ color: 'var(--ink-3)' }}>
          …
        </div>
      )}

      {state.kind === 'not_found' && <NotFound />}

      {state.kind === 'error' && (
        <p style={{ color: 'var(--accent-deep)' }}>{state.message}</p>
      )}

      {state.kind === 'ready' && !user && <Body event={state.event} token={token!} />}
    </PaperLayout>
  );
}

// ─────────────────────────── parts ───────────────────────────

function TopRow() {
  const { t } = useI18n();
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 'var(--s-3)',
        marginBottom: 'var(--s-5)',
        flexWrap: 'wrap',
      }}
    >
      <Link
        to="/"
        style={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--s-2)',
        }}
      >
        <span
          className="display-italic"
          style={{
            fontSize: 'var(--display-xs)',
            lineHeight: 1.05,
            letterSpacing: -0.4,
          }}
        >
          {t('app.name')}
        </span>
        <span
          className="marginalia"
          style={{ fontSize: 14, color: 'var(--accent)', transform: 'rotate(-3deg)' }}
        >
          — '26
        </span>
      </Link>
      <LangToggle />
    </div>
  );
}

function NotFound() {
  const { t } = useI18n();
  return (
    <section style={{ padding: 'var(--s-5) 0' }}>
      <p
        className="display-italic"
        style={{ fontSize: 'var(--display-s)', color: 'var(--ink-2)', margin: 0 }}
      >
        {t('events.landing.notFound')}
      </p>
    </section>
  );
}

function Body({ event, token }: { event: EventView; token: string }) {
  const { t } = useI18n();
  const nextUrl = encodeURIComponent(`/event/${token}`);
  const dateText = event.occurs_on ? formatOccursOn(event.occurs_on) : null;
  const participantWord =
    event.participant_count === 1
      ? t('events.landing.participantOne')
      : t('events.landing.participantMany');

  return (
    <>
      <header style={{ marginBottom: 'var(--s-5)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
          {t(`events.kind.${event.kind}` as never) || event.kind}
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
          {event.title}
        </h1>
        <p
          className="marginalia"
          style={{
            margin: 'var(--s-2) 0 0',
            fontSize: 17,
            color: 'var(--accent)',
            transform: 'rotate(-1.2deg)',
            display: 'inline-block',
          }}
        >
          {t('events.landing.forHonoree', { name: event.honoree_name })}
        </p>
        {dateText && (
          <p style={{ color: 'var(--ink-3)', marginTop: 'var(--s-2)', fontSize: 14 }}>
            {dateText}
          </p>
        )}
        {event.participant_count > 0 && (
          <p className="mono-meta" style={{ color: 'var(--ink-3)', marginTop: 'var(--s-2)' }}>
            {t('events.landing.participants', {
              count: event.participant_count,
              countWord: participantWord,
            })}
          </p>
        )}
      </header>

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '0 0 var(--s-4)' }} />

      {event.items.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 'var(--s-4)',
          }}
        >
          {event.items.map((item) => (
            <li key={item.id}>
              <ItemRow item={item} />
            </li>
          ))}
        </ul>
      )}

      <SignInCta nextUrl={nextUrl} />
    </>
  );
}

function ItemRow({ item }: { item: EventViewItem }) {
  return (
    <article>
      <ItemPhoto coverUrl={item.cover_url} aspectRatio="4 / 3" alt={item.title} />
      <div
        style={{
          paddingTop: 'var(--s-2)',
          fontFamily: 'var(--font-body)',
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--ink)',
          lineHeight: 1.3,
        }}
      >
        {item.title}
      </div>
      {(item.maker || item.price_text) && (
        <div
          className="mono-meta"
          style={{ color: 'var(--ink-3)', marginTop: 'var(--s-1)', fontSize: 12 }}
        >
          {[item.maker, item.price_text].filter(Boolean).join(' · ')}
        </div>
      )}
      {/* Owner's personal note — same 2-line clamp + ink-2 styling as the
          other list views. Grid mosaic stays visually consistent because
          the clamp prevents long notes from making one card much taller
          than its neighbours. */}
      {item.note && (
        <div
          style={{
            marginTop: 'var(--s-1)',
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
      {/* Same pattern as MyList grid `ItemCard`: render the priority dots
          only for non-default levels (1 = «очень хочу», 3 = «если найдётся»)
          so default-priority cards stay visually quiet. Sections aren't a
          fit for the mosaic layout used here — the dot marker carries the
          signal without breaking the grid. */}
      {item.priority !== 2 && (
        <div style={{ marginTop: 'var(--s-1)' }}>
          <PriorityDots level={item.priority === 1 ? 1 : 3} />
        </div>
      )}
    </article>
  );
}

function SignInCta({ nextUrl }: { nextUrl: string }) {
  const { t } = useI18n();
  return (
    <div style={{ marginTop: 'var(--s-6)', textAlign: 'center' }}>
      <Link
        to={`/login?next=${nextUrl}`}
        style={{
          background: 'var(--accent)',
          color: 'var(--paper)',
          padding: '12px 24px',
          textDecoration: 'none',
          display: 'inline-block',
          fontFamily: 'var(--font-body)',
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        {t('events.landing.signInToClaim')}
      </Link>
    </div>
  );
}

function formatOccursOn(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  } catch {
    return iso;
  }
}
