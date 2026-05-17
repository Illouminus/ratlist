/**
 * `<I18nProvider>` — language state + `t()` translator.
 *
 * Wrap once near the top of the React tree; descendants read via
 * `useI18n` from `./useI18n`. The dictionary lives in `./ru.ts` (source
 * of truth) and `./en.ts` must conform to the same shape — enforced by
 * TypeScript.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ru, type Translation } from './ru';
import { en } from './en';
import { I18nContext, type I18nContextValue, type Lang } from './i18n-context';

const dictionaries: Record<Lang, Translation> = { ru, en };
const STORAGE_KEY = 'kryska.lang';

/**
 * Walks a dot-path through a (possibly nested) dictionary, returning the
 * leaf string at the end or `undefined` if any segment is missing or the
 * leaf isn't a string. Supports arbitrary nesting depth.
 */
function lookup(dict: Translation, path: string[]): string | undefined {
  let cur: string | Translation = dict;
  for (const segment of path) {
    if (typeof cur === 'string') return undefined;
    const next: string | Translation | undefined = cur[segment];
    if (next === undefined) return undefined;
    cur = next;
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** Substitutes `{name}` placeholders with values from `vars`. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

/**
 * Default language for new visitors. We target FR/global primarily, so
 * `en` is the safer default — RU users land via the toggle once and
 * their choice persists. Existing users with a stored preference keep
 * whichever they already picked.
 */
function loadInitialLang(): Lang {
  if (typeof localStorage === 'undefined') return 'en';
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'en' || stored === 'ru' ? stored : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(loadInitialLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* private-mode storage etc. — non-fatal. */
    }
  }, []);

  // Keep <html lang> in sync with the active language. Helps screen
  // readers, search crawlers and the browser's quote-style heuristics.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const path = key.split('.');
      // Try the active language, then fall back to RU (source of truth),
      // then return the key itself so missing strings are visible.
      const hit = lookup(dictionaries[lang], path) ?? lookup(dictionaries.ru, path);
      if (hit === undefined) {
        if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
        return key;
      }
      return interpolate(hit, vars);
    },
    [lang],
  );

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
