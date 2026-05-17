/**
 * `LegalScreen` — wrapper around the static Privacy Policy and Terms of
 * Service documents. One screen rather than two so the chrome (back
 * link, language toggle, eyebrow / title / last-updated, article shell)
 * is defined in a single place.
 *
 * Content is picked by `(doc, language)` from a registry; each entry is
 * a small JSX component owning its locale's text verbatim. Plain JSX
 * was preferred to a Markdown loader so the text is searchable, type
 * checked, and doesn't add a build dependency.
 */
import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import type { Lang } from '../../i18n/i18n-context';
import { PaperLayout } from '../../components/PaperLayout';
import { LangToggle } from '../../components/LangToggle';
import { PrivacyEn } from './PrivacyEn';
import { PrivacyRu } from './PrivacyRu';
import { TermsEn } from './TermsEn';
import { TermsRu } from './TermsRu';

export type LegalDoc = 'privacy' | 'terms';

interface LegalScreenProps {
  doc: LegalDoc;
}

/**
 * Last-updated date is rendered as plain text via the i18n label. Bump
 * this constant when revising any of the four content components above
 * — there's no per-document granularity yet (and there doesn't need to
 * be while both docs are short and we revise them together).
 */
const LAST_UPDATED = '2026-05-17';

/** Locale-keyed lookup. Adding a new language is one new column. */
const CONTENT: Record<LegalDoc, Record<Lang, ComponentType>> = {
  privacy: { en: PrivacyEn, ru: PrivacyRu },
  terms: { en: TermsEn, ru: TermsRu },
};

export function LegalScreen({ doc }: LegalScreenProps) {
  const { t, lang } = useI18n();
  const Content = CONTENT[doc][lang];

  return (
    <PaperLayout narrow>
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--s-6)',
        }}
      >
        <Link
          to="/"
          className="mono-meta"
          style={{ color: 'var(--ink-2)', textDecoration: 'none' }}
        >
          ‹ {t('legal.back')}
        </Link>
        <LangToggle />
      </nav>

      <header style={{ marginBottom: 'var(--s-6)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-3)' }}>
          {t(`legal.${doc}Eyebrow`)}
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
          {t(`legal.${doc}Title`)}
        </h1>
        <p
          className="mono-meta"
          style={{ marginTop: 'var(--s-3)', color: 'var(--ink-3)' }}
        >
          {t('legal.lastUpdated', { date: LAST_UPDATED })}
        </p>
      </header>

      <div className="legal-article">
        <Content />
      </div>
    </PaperLayout>
  );
}
