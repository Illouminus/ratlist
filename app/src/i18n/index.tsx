/**
 * `<I18nProvider>` — language state + `t()` translator.
 *
 * Wrap once near the top of the React tree; descendants read via
 * `useI18n` from `./useI18n`. The dictionary lives in `./ru.ts` (source
 * of truth) and `./en.ts` must conform to the same shape — enforced by
 * TypeScript.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ru, type Translation } from './ru';
import { en } from './en';
import { I18nContext, type I18nContextValue, type Lang } from './i18n-context';

const dictionaries: Record<Lang, Translation> = { ru, en };
const STORAGE_KEY = 'kryska.lang';

/** Walks a dot-path through a dictionary and returns the leaf string if any. */
function lookup(dict: Translation, path: string[]): string | undefined {
  if (path.length < 2) return undefined;
  const sectionKey = path[0];
  if (sectionKey === undefined) return undefined;
  const section = dict[sectionKey];
  if (!section) return undefined;
  let cur: string | undefined;
  for (let i = 1; i < path.length; i++) {
    const key = path[i];
    if (key === undefined) return undefined;
    const value = section[key];
    if (value === undefined) return undefined;
    cur = value;
  }
  return cur;
}

/** Substitutes `{name}` placeholders with values from `vars`. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

function loadInitialLang(): Lang {
  if (typeof localStorage === 'undefined') return 'ru';
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'en' || stored === 'ru' ? stored : 'ru';
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
    document.documentElement.lang = l;
  }, []);

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
