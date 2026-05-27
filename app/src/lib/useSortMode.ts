/**
 * `useSortMode()` — localStorage-backed selector for the three list
 * screens (MyList, FriendList, PublicList). Drives `<SortSelector>`
 * and pairs with `useViewMode()`. Stored globally so the user's
 * choice is consistent across surfaces.
 *
 * Default is 'priority' — matches the historical implicit sort and
 * keeps section headers (•••/••/•) intact when the user hasn't picked
 * anything else.
 */
import { useEffect, useState } from 'react';

export type SortMode = 'priority' | 'price' | 'category';

const STORAGE_KEY = 'kryska.sortMode';
const ALLOWED: ReadonlyArray<SortMode> = ['priority', 'price', 'category'];

function isSortMode(v: string | null): v is SortMode {
  return v !== null && (ALLOWED as ReadonlyArray<string>).includes(v);
}

function readStored(): SortMode {
  if (typeof window === 'undefined') return 'priority';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isSortMode(raw) ? raw : 'priority';
  } catch {
    return 'priority';
  }
}

export function useSortMode(): [SortMode, (next: SortMode) => void] {
  const [mode, setMode] = useState<SortMode>(readStored);

  const update = (next: SortMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode / storage disabled — non-persisted toggle still works.
    }
  };

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && isSortMode(e.newValue)) {
        setMode(e.newValue);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return [mode, update];
}
