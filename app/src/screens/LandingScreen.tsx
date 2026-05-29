/**
 * `LandingScreen` — public homepage shown to anonymous visitors at `/`.
 *
 * Editorial layout in the same style as the rest of the app:
 *   hero with italic display + Caveat annotation + mock-up of the list
 *   features grid (4 cards)
 *   how-it-works (3 steps)
 *   final CTA
 *   footer
 *
 * Renders ONLY for anonymous users — see Router.tsx, which falls back
 * to MyListScreen for authenticated callers on the same path. The
 * design language matches the in-app screens so the transition into
 * the product doesn't feel like a different site.
 */
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/useI18n';
import { LangToggle } from '../components/LangToggle';
import { Button } from '../components/Button';
import { PaperLayout } from '../components/PaperLayout';
import { SittingRat, PeekingRat, RunningRat, TailDoodle } from '../components/rats';
import { useInView } from '../lib/useInView';

export function LandingScreen() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <PaperLayout as="main">
      <TopBar />
      <Hero />
      <Features />
      <HowItWorks />
      <FinalCta />
      <Footer t={t} year={year} />
    </PaperLayout>
  );
}

// ─────────────────────────── top bar ───────────────────────────

function TopBar() {
  const { t } = useI18n();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--s-7)',
      }}
    >
      <Link
        to="/"
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--s-2)',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <span
          className="display-italic"
          style={{ fontSize: 'var(--display-s)', letterSpacing: -0.5 }}
        >
          {t('app.name')}
        </span>
        <span
          className="marginalia"
          style={{ fontSize: 14, color: 'var(--accent)', transform: 'rotate(-3deg)' }}
        >
          — '{String(new Date().getFullYear()).slice(-2)}
        </span>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
        <LangToggle />
        <Link to="/login" style={{ textDecoration: 'none' }}>
          {/* Padding + minHeight bring this above the 44 px touch-target
              threshold; ghost variant defaults to padding: 0 which is too
              tight for a primary nav affordance on mobile. */}
          <Button
            variant="ghost"
            style={{
              color: 'var(--ink-2)',
              padding: '10px 14px',
              minHeight: 44,
            }}
          >
            {t('auth.signIn')}
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────── hero ───────────────────────────

function Hero() {
  const { t } = useI18n();
  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: 'var(--s-7)',
        marginBottom: 'var(--s-8)',
        position: 'relative',
      }}
      className="landing-hero"
    >
      <div style={{ position: 'relative' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-3)' }}>
          {t('landing.eyebrow')}
        </div>
        <h1
          className="display-italic"
          style={{
            margin: 0,
            fontSize: 'var(--display-xl)',
            lineHeight: 1.0,
            letterSpacing: -1.5,
            whiteSpace: 'pre-line',
          }}
        >
          {t('landing.headline')}
        </h1>
        <p
          className="marginalia"
          style={{
            margin: 'var(--s-3) 0 0',
            fontSize: 22,
            color: 'var(--accent)',
            transform: 'rotate(-1.5deg)',
            display: 'inline-block',
          }}
        >
          {t('landing.annotation')}
        </p>

        <p
          style={{
            marginTop: 'var(--s-5)',
            fontSize: 16,
            color: 'var(--ink-2)',
            lineHeight: 1.55,
            maxWidth: 480,
          }}
        >
          {t('landing.sub')}
        </p>

        <div
          style={{
            marginTop: 'var(--s-6)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-4)',
            flexWrap: 'wrap',
          }}
        >
          <Link to="/login" style={{ textDecoration: 'none' }}>
            <Button variant="primary" style={{ padding: '14px 28px', fontSize: 13 }}>
              {t('landing.primaryCta')}
            </Button>
          </Link>
          <span
            className="marginalia"
            style={{ fontSize: 16, color: 'var(--ink-3)' }}
          >
            {t('landing.primaryCtaHint')}
          </span>
        </div>
      </div>

      <div
        className="landing-hero-mock"
        aria-hidden
        style={{ position: 'relative' }}
      >
        <ListMockup />
        <div
          className="landing-mock-rat-bob"
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            opacity: 0.75,
            pointerEvents: 'none',
          }}
        >
          <SittingRat size={56} />
        </div>
      </div>
    </section>
  );
}

/** Small paper card with 3 fake item rows. Pure decoration — gives
 *  visitors an instant sense of "this is what your list looks like"
 *  without needing screenshots that would drift from the real UI. */
function ListMockup() {
  const { t } = useI18n();
  return (
    <div
      style={{
        background: '#fffdf6',
        border: '1px solid var(--hair)',
        padding: 'var(--s-5)',
        boxShadow: '0 8px 24px rgba(43, 38, 32, 0.06)',
      }}
    >
      <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
        {t('list.currentlySaved')}
      </div>
      <h3
        className="display-italic"
        style={{
          margin: 0,
          fontSize: 28,
          lineHeight: 1.0,
          letterSpacing: -0.8,
          whiteSpace: 'pre-line',
        }}
      >
        {t('list.headlineMine')}
      </h3>
      <p
        className="marginalia"
        style={{
          margin: 'var(--s-2) 0 var(--s-4)',
          fontSize: 14,
          color: 'var(--accent)',
          transform: 'rotate(-1.5deg)',
          display: 'inline-block',
        }}
      >
        {t('list.annotation')}
      </p>
      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: 0 }} />
      <MockRow index={1} title="Falcon enamel mug"     price="€19,00" kind="mug"   delay={200} />
      <MockRow index={2} title="Linen apron, oatmeal"  price="€78,00" kind="apron" delay={320} />
      <MockRow index={3} title="Muji 0.38 gel pens ×10" price="€14,00" kind="pens"  delay={440} />
      <div
        className="fade-up landing-mock-tail-wrap"
        style={{
          paddingTop: 'var(--s-4)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-3)',
          animationDelay: '560ms',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 13,
            color: 'var(--ink-3)',
          }}
        >
          {t('list.thatsTheLot')}
        </span>
        <span style={{ flex: 1, height: 1, background: 'var(--hair)' }} />
        <TailDoodle size={20} />
      </div>
    </div>
  );
}

type ItemKind = 'mug' | 'apron' | 'pens';

function MockRow({
  index,
  title,
  price,
  kind,
  delay,
}: {
  index: number;
  title: string;
  price: string;
  kind: ItemKind;
  delay: number;
}) {
  return (
    <div
      className="fade-up"
      style={{
        display: 'flex',
        gap: 'var(--s-3)',
        padding: 'var(--s-3) 0',
        borderBottom: '1px solid var(--hair)',
        alignItems: 'center',
        animationDelay: `${delay}ms`,
      }}
    >
      <div
        style={{
          width: 56,
          height: 42,
          flexShrink: 0,
          position: 'relative',
          background: '#fffdf6',
          boxShadow: 'inset 0 0 0 1px var(--hair)',
        }}
      >
        <ItemSilhouette kind={kind} />
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 10,
            color: 'var(--ink)',
            background: 'rgba(250, 246, 239, 0.85)',
            padding: '0 4px',
            letterSpacing: 0.4,
          }}
        >
          {String(index).padStart(2, '0')}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: 13,
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
      </div>
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
        {price}
      </div>
    </div>
  );
}

/** Tiny iconographic silhouette — a watercolour wash bleeding inside a
 *  hand-drawn outline of the product. Same painterly philosophy as the
 *  earlier blob, but the shape now reads as the actual thing instead of
 *  an abstract smudge. Uses the shared `#ratWobble` filter so the lines
 *  look painted, not vector. */
function ItemSilhouette({ kind }: { kind: ItemKind }) {
  const wash =
    kind === 'mug'   ? '#ecccb8' :
    kind === 'apron' ? '#bdcdb3' :
                       '#d4b7c1';

  return (
    <svg
      viewBox="0 0 56 42"
      width="100%"
      height="100%"
      style={{ display: 'block' }}
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="28" cy="22" rx="18" ry="13" fill={wash} opacity={0.55} />
      <g
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.5}
        filter="url(#ratWobble)"
      >
        {kind === 'mug' && (
          <>
            <path d="M 16,12 L 16,30 Q 16,34 20,34 L 26,34 Q 30,34 30,30 L 30,12 Z" />
            <path d="M 30,16 Q 38,17 38,22 Q 38,27 30,28" />
            <line x1="17" y1="15" x2="29" y2="15" />
          </>
        )}
        {kind === 'apron' && (
          <>
            <path d="M 20,12 L 36,12 L 38,16 L 38,34 L 18,34 L 18,16 Z" />
            <path d="M 22,12 Q 23,6 17,5" />
            <path d="M 34,12 Q 33,6 39,5" />
            <line x1="22" y1="24" x2="34" y2="24" />
          </>
        )}
        {kind === 'pens' && (
          <>
            <path d="M 17,10 L 21,10 L 21,30 L 19,34 L 17,30 Z" />
            <path d="M 26,10 L 30,10 L 30,30 L 28,34 L 26,30 Z" />
            <path d="M 35,10 L 39,10 L 39,30 L 37,34 L 35,30 Z" />
            <line x1="17" y1="13" x2="21" y2="13" />
            <line x1="26" y1="13" x2="30" y2="13" />
            <line x1="35" y1="13" x2="39" y2="13" />
          </>
        )}
      </g>
    </svg>
  );
}

// ─────────────────────────── features ───────────────────────────

function Features() {
  const { t } = useI18n();
  // Static feature data so the grid is one obvious lump. RatIcon is
  // the small decoration in each card's corner.
  const features = [
    { key: 1, RatIcon: PeekingRat },
    { key: 2, RatIcon: SittingRat },
    { key: 3, RatIcon: RunningRat },
    { key: 4, RatIcon: SittingRat },
  ] as const;

  return (
    <section style={{ marginBottom: 'var(--s-8)' }}>
      {/* Promoted to <h2> so the heading order on the landing page is
          h1 (hero) → h2 (features) → h3 (each feature card) without a
          gap. Visually still rendered as the small mono-meta eyebrow. */}
      <h2
        className="mono-meta"
        style={{
          margin: '0 0 var(--s-3)',
          color: 'var(--ink-3)',
          fontWeight: 'inherit',
          fontSize: 'inherit',
          letterSpacing: 'inherit',
          textTransform: 'inherit',
        }}
      >
        {t('landing.featuresEyebrow')}
      </h2>
      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '0 0 var(--s-5)' }} />
      <div
        className="landing-features"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 'var(--s-6) var(--s-5)',
        }}
      >
        {features.map(({ key, RatIcon }) => (
          <FeatureCard key={key} idx={key} RatIcon={RatIcon} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({
  idx,
  RatIcon,
}: {
  idx: 1 | 2 | 3 | 4;
  RatIcon: typeof SittingRat;
}) {
  const { t } = useI18n();
  return (
    <article style={{ position: 'relative', paddingRight: 48 }}>
      <h3
        className="display-italic"
        style={{
          margin: 0,
          fontSize: 'var(--display-m)',
          lineHeight: 1.0,
          letterSpacing: -1,
          whiteSpace: 'pre-line',
        }}
      >
        {t(`landing.feature${idx}Title`)}
      </h3>
      <p
        style={{
          marginTop: 'var(--s-3)',
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--ink-2)',
        }}
      >
        {t(`landing.feature${idx}Body`)}
      </p>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          opacity: 0.55,
          pointerEvents: 'none',
        }}
      >
        <RatIcon size={36} />
      </div>
    </article>
  );
}

// ─────────────────────────── how it works ───────────────────────────

function HowItWorks() {
  const { t } = useI18n();
  // Reveal-on-scroll: the section renders in its final state by default
  // (prerender / no-JS safe); when it scrolls into view we add
  // `is-revealed`, which plays the trail-draw + running rat + staggered
  // step entrance. See global.css → "Landing how it works".
  const { ref, inView } = useInView<HTMLElement>(0.3);

  return (
    <section
      ref={ref}
      className={`landing-how${inView ? ' is-revealed' : ''}`}
      style={{ marginBottom: 'var(--s-8)' }}
    >
      <div
        className="mono-meta"
        style={{ marginBottom: 'var(--s-2)', color: 'var(--ink-3)' }}
      >
        {t('landing.howEyebrow')}
      </div>
      <h2
        className="display-italic"
        style={{
          margin: 0,
          fontSize: 'var(--display-l)',
          lineHeight: 1.05,
          letterSpacing: -1,
        }}
      >
        {t('landing.howTitle')}
      </h2>

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: 'var(--s-5) 0 var(--s-5)' }} />

      {/* Decorative trail a rat runs across as the steps reveal. Desktop
          only (the steps sit in a row there); hidden on mobile via CSS. */}
      <div className="landing-how-track" aria-hidden>
        <svg
          className="landing-how-trail-svg"
          viewBox="0 0 1000 28"
          preserveAspectRatio="none"
          width="100%"
          height="28"
        >
          <path
            className="landing-how-trail"
            pathLength={1000}
            d="M4,18 C 180,4 300,24 480,14 C 640,6 770,24 996,12"
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.6}
            strokeLinecap="round"
            opacity={0.65}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="landing-how-runner">
          <RunningRat size={40} />
        </div>
      </div>

      <ol
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--s-6)',
        }}
      >
        {[1, 2, 3].map((n) => (
          <li
            key={n}
            className="landing-how-step"
            style={{ animationDelay: `${250 + (n - 1) * 150}ms` }}
          >
            <div
              className="display-italic"
              style={{
                fontSize: 'var(--display-m)',
                color: 'var(--accent)',
                lineHeight: 1,
                letterSpacing: -1,
                marginBottom: 'var(--s-3)',
              }}
            >
              {String(n).padStart(2, '0')}
            </div>
            <h3
              className="display-italic"
              style={{
                margin: 0,
                fontSize: 'var(--display-s)',
                lineHeight: 1.1,
                letterSpacing: -0.5,
              }}
            >
              {t(`landing.how${n}Title`)}
            </h3>
            <p
              style={{
                marginTop: 'var(--s-2)',
                fontSize: 14,
                lineHeight: 1.55,
                color: 'var(--ink-2)',
              }}
            >
              {t(`landing.how${n}Body`)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ─────────────────────────── final CTA ───────────────────────────

function FinalCta() {
  const { t } = useI18n();
  return (
    <section
      style={{
        marginBottom: 'var(--s-8)',
        padding: 'var(--s-7) var(--s-5)',
        background: 'var(--accent-soft)',
        borderRadius: 'var(--r-3)',
        textAlign: 'center',
        position: 'relative',
      }}
    >
      {/* On the accent-soft FinalCta background the mono-meta default
          color (--ink-3) sits at 4.46:1 contrast, just under WCAG AA.
          Bump to --ink-2 locally so the section passes. */}
      <div
        className="mono-meta"
        style={{ marginBottom: 'var(--s-3)', color: 'var(--ink-2)' }}
      >
        {t('landing.ctaEyebrow')}
      </div>
      <h2
        className="display-italic"
        style={{
          margin: 0,
          fontSize: 'var(--display-l)',
          lineHeight: 1.05,
          letterSpacing: -1,
          maxWidth: 720,
          marginInline: 'auto',
        }}
      >
        {t('landing.ctaTitle')}
      </h2>
      <p
        className="marginalia"
        style={{
          margin: 'var(--s-3) auto 0',
          fontSize: 20,
          color: 'var(--accent-deep)',
          transform: 'rotate(-1.5deg)',
          display: 'inline-block',
        }}
      >
        {t('landing.ctaSub')}
      </p>
      <div
        style={{
          marginTop: 'var(--s-5)',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <Link to="/login" style={{ textDecoration: 'none' }}>
          <Button variant="dark" style={{ padding: '14px 28px', fontSize: 13 }}>
            {t('landing.primaryCta')}
          </Button>
        </Link>
      </div>

      <div
        aria-hidden
        style={{
          marginTop: 'var(--s-5)',
          display: 'flex',
          justifyContent: 'center',
          opacity: 0.7,
        }}
      >
        <SittingRat size={80} />
      </div>
    </section>
  );
}

// ─────────────────────────── footer ───────────────────────────

function Footer({
  t,
  year,
}: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  year: number;
}) {
  return (
    <footer
      style={{
        marginTop: 'var(--s-7)',
        paddingTop: 'var(--s-4)',
        borderTop: '1px solid var(--hair)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 'var(--s-4)',
        color: 'var(--ink-3)',
      }}
    >
      <span className="marginalia" style={{ fontSize: 15 }}>
        {t('landing.footerTagline')}
      </span>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--s-4)',
          alignItems: 'center',
        }}
      >
        <Link
          to="/legal/privacy"
          className="mono-meta"
          style={{ color: 'var(--ink-3)', textDecoration: 'none' }}
        >
          {t('landing.footerPrivacy')}
        </Link>
        <Link
          to="/legal/terms"
          className="mono-meta"
          style={{ color: 'var(--ink-3)', textDecoration: 'none' }}
        >
          {t('landing.footerTerms')}
        </Link>
        <span className="mono-meta">{t('landing.footerCopy', { year })}</span>
      </div>
    </footer>
  );
}
