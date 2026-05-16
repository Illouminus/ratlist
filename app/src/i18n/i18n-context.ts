/**
 * React context for i18n. Lives in its own file so the `i18n/index.tsx`
 * module only exports components — required for Vite's fast-refresh.
 */
import { createContext } from 'react';

export type Lang = 'ru' | 'en';

export interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);
