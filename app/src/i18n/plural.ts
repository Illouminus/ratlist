/**
 * Plural form helper. Uses the browser's `Intl.PluralRules` to pick the
 * right CLDR category for the given language, then maps that to the
 * appropriate string from a small `forms` map.
 *
 * Russian has three plural forms ("1 круг", "2 круга", "5 кругов"); English
 * has two ("1 circle", "2 circles"). Pass all three; the helper picks one.
 */
import type { Lang } from './i18n-context';

export interface PluralForms {
  /** Used for CLDR `one` (RU: 1, 21, 31...; EN: 1). */
  one: string;
  /** Used for CLDR `few` (RU: 2-4, 22-24...). Falls back to `many`. */
  few?: string;
  /** Used for CLDR `many` (RU: 0, 5-20, 25-30...) and as the generic plural. */
  many: string;
}

const RULES: Record<Lang, Intl.PluralRules> = {
  ru: new Intl.PluralRules('ru'),
  en: new Intl.PluralRules('en'),
};

export function pluralForm(lang: Lang, n: number, forms: PluralForms): string {
  const category = RULES[lang].select(n);
  if (category === 'one') return forms.one;
  if (category === 'few') return forms.few ?? forms.many;
  return forms.many;
}

/** Renders "{n} {word}" using a NBSP (\u00A0) to avoid mid-phrase line wraps. */
export function pluralPhrase(lang: Lang, n: number, forms: PluralForms): string {
  return n + "\u00A0" + pluralForm(lang, n, forms);
}
