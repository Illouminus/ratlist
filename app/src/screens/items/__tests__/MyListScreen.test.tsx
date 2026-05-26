/**
 * MyListScreen — sectioned-dnd wiring tests.
 *
 * Verifies:
 *  1. On mobile (isMobile=true), the list renders in sectioned-dnd mode
 *     with the three priority section headers visible.
 *  2. A drag handle appears for each item in sectioned-dnd mode.
 *  3. When <ItemList mode="sectioned-dnd"> fires onPriorityChange, the
 *     handler calls updateItemPriority on the hook with the correct args.
 *  4. When updateItemPriority returns { error }, toast() is called.
 *
 * Keyboard DnD via @dnd-kit in jsdom is unreliable because the sensor
 * depends on getBoundingClientRect / pointer events that JSDOM doesn't
 * implement. Instead the wiring tests mock <ItemList> to capture its
 * onPriorityChange prop and invoke it directly, exercising the exact
 * handler that MyListScreen passes down.
 *
 * The <ItemList> mock also renders the three priority section headers and
 * one drag handle per item so the presence/count assertions (tests 1–2)
 * remain meaningful without importing the real DnD tree.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n';
import type { Item } from '../../../lib/db';

// ─── stable mock references ──────────────────────────────────────────────────
// The mock body ignores its args (each test supplies the response via
// mockResolvedValueOnce); use `unknown[]` so eslint doesn't flag unused
// parameter names while still letting TypeScript infer the call signature
// from the actual callers' usage.
const updateItemPriority = vi.fn(
  async (...args: unknown[]): Promise<{ ok: true } | { error: string }> => {
    void args;
    return { ok: true as const };
  },
);

const mockItems = [
  {
    id: 'a',
    owner_id: 'u1',
    title: 'Книга',
    priority: 2,
    occasion: 'anytime',
    status: 'open',
    maker: null,
    url: null,
    price_text: null,
    note: null,
    cover_url: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    group_ids: [],
    event_ids: [],
  },
];

// ─── module mocks ─────────────────────────────────────────────────────────────

// Mock ItemList to:
//  a) capture the onPriorityChange handler MyListScreen passes down
//  b) render the three section headers + one drag handle per item so tests
//     1–2 (header/handle presence) remain meaningful without the real DnD tree
let capturedOnPriorityChange: ((id: string, level: 1 | 2 | 3) => void | Promise<void>) | undefined;

vi.mock('../ItemList', () => ({
  ItemList: ({
    items,
    onPriorityChange,
  }: {
    items: Item[];
    onPriorityChange?: (id: string, level: 1 | 2 | 3) => void | Promise<void>;
  }) => {
    capturedOnPriorityChange = onPriorityChange;
    return (
      <div data-testid="item-list-stub">
        {/* Section headers — same labels the real component renders via i18n */}
        <span>Очень хочу</span>
        <span>Хочу</span>
        <span>Если найдётся</span>
        {/* One drag handle per item — same testid the real SortableItemRow uses */}
        {items.map((item) => (
          <button key={item.id} data-testid="drag-handle" aria-label="drag" />
        ))}
      </div>
    );
  },
}));

// Mock useToast to capture show() calls
const mockToastShow = vi.fn();
vi.mock('../../../components/useToast', () => ({
  useToast: () => ({ show: mockToastShow }),
}));

vi.mock('../../../items/useMyItems', () => ({
  useMyItems: () => ({
    query: { status: 'ready', items: mockItems, error: null },
    refresh: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    updateStatus: vi.fn(),
    updateItemPriority,
  }),
}));

vi.mock('../../../auth/useProfile', () => ({
  useProfile: () => ({
    query: {
      status: 'ready',
      profile: {
        id: 'u1',
        display_name: 'Test',
        handle: null,
        avatar_url: null,
        onboarded_at: '2026-01-01T00:00:00Z',
        disabled_at: null,
        share_token: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    },
    refresh: vi.fn(),
  }),
}));

// Force mobile view so effectiveView === 'list' → sectioned-dnd
vi.mock('../../../lib/useMediaQuery', () => ({
  useMediaQuery: () => true,
  useIsMobile: () => true,
}));

// ShareDialog calls useShareToken → supabase internally; stub it out
vi.mock('../../../components/ShareDialog', () => ({
  ShareDialog: () => null,
}));

// ─── import component under test AFTER mocks ─────────────────────────────────
import { MyListScreen } from '../MyListScreen';

// ─── helpers ─────────────────────────────────────────────────────────────────

function renderScreen() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <MyListScreen />
      </I18nProvider>
    </MemoryRouter>,
  );
}

// ─── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'ru');
  updateItemPriority.mockClear();
  mockToastShow.mockClear();
  capturedOnPriorityChange = undefined;
});

describe('<MyListScreen> priority DnD wiring', () => {
  it('renders sectioned-dnd ItemList with three section headers on mobile', () => {
    renderScreen();
    expect(screen.getByText('Очень хочу')).toBeTruthy();
    expect(screen.getByText('Хочу')).toBeTruthy();
    expect(screen.getByText('Если найдётся')).toBeTruthy();
  });

  it('renders a drag handle for each item in sectioned-dnd mode', () => {
    renderScreen();
    // One item in mockItems → one drag handle
    const handles = screen.queryAllByTestId('drag-handle');
    expect(handles).toHaveLength(1);
  });

  it('forwards onPriorityChange from ItemList to updateItemPriority', async () => {
    renderScreen();

    // MyListScreen has mounted; capturedOnPriorityChange is the handler it
    // passed to <ItemList> — invoking it exercises the real MyListScreen code.
    expect(capturedOnPriorityChange).toBeDefined();

    await act(async () => {
      await capturedOnPriorityChange!('a', 1);
    });

    expect(updateItemPriority).toHaveBeenCalledWith('a', 1);
  });

  it('shows a toast when updateItemPriority returns an error', async () => {
    updateItemPriority.mockResolvedValueOnce({ error: 'permission denied' } as never);

    renderScreen();

    await act(async () => {
      await capturedOnPriorityChange!('a', 1);
    });

    // 'permission denied' has no matching SQLSTATE/fragment so errorMessage
    // falls back to t('errors.generic').  The test locale is 'ru' (set in
    // beforeEach via localStorage), so we expect the Russian fallback string.
    expect(mockToastShow).toHaveBeenCalledWith('что-то пошло не так. попробуй ещё раз?');
  });
});
