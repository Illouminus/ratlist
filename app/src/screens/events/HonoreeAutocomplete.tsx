/**
 * `HonoreeAutocomplete` — search dropdown for picking the honoree of an
 * event when creating "for someone else" (HR-mode).
 *
 * - Debounced 300 ms query against `search_users_for_event` RPC.
 * - Shows up to 8 circle-mates matching the typed name.
 * - Always appends a "use '{query}' as a name" fallback row so
 *   non-app users (family members, etc.) can be honoured by free text.
 * - Styling follows the editorial aesthetic: hairlines, no shadow cards,
 *   paper/ink palette, tokens only.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { debounce } from '../../lib/debounce';
import { useI18n } from '../../i18n/useI18n';

export interface UserMatch {
  id: string;
  display_name: string;
}

interface Props {
  query: string;
  onSelectUser: (id: string, displayName: string) => void;
  onSelectFreeText: (name: string) => void;
}

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; results: UserMatch[] };

async function fetchMatches(q: string): Promise<UserMatch[]> {
  if (!q.trim()) return [];
  const { data, error } = await supabase.rpc('search_users_for_event', { _q: q });
  if (error || !data) return [];
  // RPC returns { id: uuid, display_name: text }[]
  return (data as UserMatch[]).filter((r) => r.id && r.display_name);
}

export function HonoreeAutocomplete({ query, onSelectUser, onSelectFreeText }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const debouncedRef = useRef<ReturnType<typeof debounce> | null>(null);

  useEffect(() => {
    // Build a fresh debounced function once and keep it stable.
    const fn = debounce((q: string) => {
      if (!q.trim()) {
        setState({ kind: 'idle' });
        return;
      }
      setState({ kind: 'loading' });
      void fetchMatches(q).then((results) => {
        setState({ kind: 'done', results });
      });
    }, 300);
    debouncedRef.current = fn;
    return () => {
      fn.cancel();
    };
  }, []);

  // Fire debounced search whenever query changes.
  useEffect(() => {
    debouncedRef.current?.(query);
  }, [query]);

  const trimmed = query.trim();

  // Nothing to show if no query or result set is empty and we have no text
  const showDropdown = trimmed.length > 0 && state.kind !== 'idle';

  if (!showDropdown) return null;

  const results = state.kind === 'done' ? state.results : [];

  return (
    <ul
      role="listbox"
      aria-label={t('events.honoree.label')}
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        border: '1px solid var(--hair-strong)',
        borderTop: 'none',
        background: 'var(--paper)',
      }}
    >
      {state.kind === 'loading' && (
        <li
          aria-busy="true"
          style={{
            padding: '8px 12px',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: 'var(--ink-3)',
          }}
        >
          …
        </li>
      )}

      {results.map((u) => (
        <li key={u.id} role="option" aria-selected={false}>
          <button
            type="button"
            onClick={() => onSelectUser(u.id, u.display_name)}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 12px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--hair)',
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              color: 'var(--ink)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseOver={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-soft)';
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            {u.display_name}
          </button>
        </li>
      ))}

      {/* Free-text fallback — always visible when there's a non-empty query */}
      <li role="option" aria-selected={false}>
        <button
          type="button"
          onClick={() => onSelectFreeText(trimmed)}
          style={{
            display: 'block',
            width: '100%',
            padding: '8px 12px',
            background: 'transparent',
            border: 'none',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: 'var(--accent)',
            cursor: 'pointer',
            textAlign: 'left',
            fontStyle: 'italic',
          }}
          onMouseOver={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-soft)';
          }}
          onMouseOut={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          {t('events.honoree.useAsName', { query: trimmed })}
        </button>
      </li>
    </ul>
  );
}
