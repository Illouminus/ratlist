/**
 * `<CategoryInput>` — free-text category field with a small autocomplete
 * popover that suggests the owner's existing categories.
 *
 * The owner's distinct categories are loaded once on mount via a direct
 * SELECT on `public.items` (RLS allows the owner to read their own rows).
 * Suggestions are filtered client-side by case-insensitive prefix match;
 * top 5 are shown in a paper-card popover under the input. Enter, click,
 * or blur all commit the value: blur with new text creates a new free-text
 * category. Clearing the input commits `null` (= "Uncategorised") to keep
 * the spec's "null = no category" invariant.
 *
 * The dropdown intentionally doesn't block the input — typing works
 * straight away; the popover only appears once the async fetch has
 * resolved AND there's at least one matching suggestion.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useI18n } from '../i18n/useI18n';
import { supabase } from '../lib/supabase';
import { Field } from './Field';
import { SketchInput } from './SketchInput';

export interface CategoryInputProps {
  value: string | null;
  onChange: (next: string | null) => void;
}

const MAX_SUGGESTIONS = 5;

export function CategoryInput({ value, onChange }: CategoryInputProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [text, setText] = useState(value ?? '');
  const [allCategories, setAllCategories] = useState<string[] | null>(null);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Mirror external `value` changes (e.g. form reset) into the local
  // text state. Parent commits only on blur/Enter/pick — never
  // per-keystroke — so this can't fight in-progress input, and React's
  // Object.is dep check skips re-runs when `value` is unchanged.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setText(value ?? ''), [value]);

  // Load the owner's distinct categories once. The fetch runs in the
  // background; the popover stays hidden until it resolves. All setState
  // calls happen after the awaited chain returns, matching the project's
  // setState-in-effect convention.
  useEffect(() => {
    const userId = user?.id;
    let cancelled = false;
    if (!userId) {
      void Promise.resolve().then(() => {
        if (!cancelled) setAllCategories([]);
      });
      return () => {
        cancelled = true;
      };
    }
    void supabase
      .from('items')
      .select('category')
      .eq('owner_id', userId)
      .not('category', 'is', null)
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as Array<{ category: string | null }>;
        const unique = Array.from(
          new Set(
            rows
              .map((r) => r.category)
              .filter((c): c is string => typeof c === 'string' && c.length > 0),
          ),
        ).sort((a, b) => a.localeCompare(b));
        setAllCategories(unique);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const suggestions = useMemo(() => {
    if (!allCategories || allCategories.length === 0) return [];
    const trimmed = text.trim();
    if (trimmed.length === 0) return [];
    const lower = trimmed.toLowerCase();
    return allCategories
      .filter((c) => c.toLowerCase().startsWith(lower) && c.toLowerCase() !== lower)
      .slice(0, MAX_SUGGESTIONS);
  }, [allCategories, text]);

  const commit = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      onChange(trimmed.length === 0 ? null : trimmed);
    },
    [onChange],
  );

  const pick = useCallback(
    (suggestion: string) => {
      setText(suggestion);
      commit(suggestion);
      setFocused(false);
      setHighlight(-1);
    },
    [commit],
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit(text);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = highlight >= 0 ? suggestions[highlight] : undefined;
      if (picked) {
        pick(picked);
      } else {
        commit(text);
      }
    } else if (e.key === 'Escape') {
      setFocused(false);
      setHighlight(-1);
    }
  }

  const showPopover = focused && suggestions.length > 0;

  return (
    <Field label={t('categories.inputLabel')} hint={t('categories.inputHelp')}>
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <SketchInput
          type="text"
          value={text}
          placeholder={t('categories.inputPlaceholder')}
          onChange={(e) => {
            setText(e.target.value);
            setHighlight(-1);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Delay so a click on a suggestion has time to fire its
            // onMouseDown handler first.
            window.setTimeout(() => {
              setFocused(false);
              setHighlight(-1);
            }, 120);
            commit(text);
          }}
          onKeyDown={onKeyDown}
          aria-autocomplete="list"
          aria-expanded={showPopover}
        />
        {showPopover && (
          <ul
            role="listbox"
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              margin: 0,
              padding: 'var(--s-1) 0',
              listStyle: 'none',
              background: 'var(--paper)',
              border: '1px solid var(--hair-strong)',
              borderRadius: 'var(--r-2)',
              boxShadow: '0 8px 20px rgba(43, 38, 32, 0.18)',
              zIndex: 10,
            }}
          >
            {suggestions.map((s, i) => (
              <li key={s} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  // mousedown fires before blur — without it the popover
                  // would close on blur and the click would never land.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    background: i === highlight ? 'var(--paper-edge)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontSize: 14,
                    color: 'var(--ink)',
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}
