/**
 * `useViewMode()` — localStorage-backed toggle between 'grid' and 'list'
 * for the three list screens (MyList, FriendList, PublicList). Stored
 * globally under a single key so the user's choice is consistent across
 * surfaces.
 *
 * First-visit default depends on viewport width: phones (<768px) start
 * in 'list' (the row layout reads better at one column), desktops in
 * 'grid'. Once the user picks, that choice is persisted and applies
 * regardless of viewport — they can hold a grid preference on mobile
 * or a list preference on desktop.
 *
 * Cross-tab sync via the `storage` event so two windows don't drift.
 */
import { useEffect, useState } from 'react';

export type ViewMode = 'grid' | 'list';

const STORAGE_KEY = 'kryska.viewMode';

function readStored(): ViewMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'list' || raw === 'grid' ? raw : null;
  } catch {
    return null;
  }
}

function defaultForViewport(): ViewMode {
  if (typeof window === 'undefined') return 'grid';
  return window.innerWidth < 768 ? 'list' : 'grid';
}

export function useViewMode(): [ViewMode, (next: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>(() => readStored() ?? defaultForViewport());

  const update = (next: ViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode / storage disabled — state still works for the
      // current tab, we just lose persistence.
    }
  };

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setView(e.newValue === 'list' ? 'list' : 'grid');
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return [view, update];
}
