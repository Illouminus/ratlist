// app/src/screens/people/__tests__/FriendListScreen.test.tsx
//
// Task 11: FriendListScreen sections items by priority (read-only).
// Task 8 (PR 2): + CategoryChips filter, composes with sort+view.
// FriendListScreen uses useFriendList, useEvents, and useAuth.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '../../../i18n';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

vi.mock('../../../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'viewer' }, session: null, status: 'authenticated' }),
}));

vi.mock('../../../events/useEvents', () => ({
  useEvents: () => ({ query: { status: 'loading', events: [] } }),
}));

interface MockFriendItem {
  id: string;
  priority: number;
  title: string;
  occasion: string;
  cover_url: null;
  owner_id: string;
  maker: null;
  url: null;
  price_text: string | null;
  note: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  category: string | null;
  visibility: string;
  claims: never[];
}

function makeFriendItem(overrides: Partial<MockFriendItem> = {}): MockFriendItem {
  return {
    id: 'a',
    priority: 2,
    title: 'Item',
    occasion: 'anytime',
    cover_url: null,
    owner_id: 'friend',
    maker: null,
    url: null,
    price_text: null,
    note: null,
    status: 'active',
    created_at: '',
    updated_at: '',
    category: null,
    visibility: 'friends',
    claims: [],
    ...overrides,
  };
}

// Mutable fixture — tests set this before render so the hook mock
// returns the right items shape on the first paint.
const fixture: { items: MockFriendItem[] } = {
  items: [
    makeFriendItem({
      id: 'a',
      priority: 1,
      title: 'Книга',
      note: 'обязательно в твёрдой обложке',
    }),
    makeFriendItem({ id: 'c', priority: 3, title: 'Носки' }),
  ],
};

vi.mock('../../../people/useFriendList', () => ({
  useFriendList: () => ({
    query: {
      status: 'ready',
      items: fixture.items,
      profile: { id: 'friend', display_name: 'Друг', handle: null, avatar_url: null },
      error: null,
    },
    claim: vi.fn(),
    release: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { FriendListScreen } from '../FriendListScreen';

function resetFixture() {
  fixture.items = [
    makeFriendItem({
      id: 'a',
      priority: 1,
      title: 'Книга',
      note: 'обязательно в твёрдой обложке',
    }),
    makeFriendItem({ id: 'c', priority: 3, title: 'Носки' }),
  ];
}

describe('<FriendListScreen> sectioning', () => {
  beforeEach(() => {
    localStorage.setItem('kryska.lang', 'ru');
    // Section headers only render in list view; grid is the jsdom default.
    localStorage.setItem('kryska.viewMode', 'list');
    resetFixture();
  });

  it('groups items by priority with section headers, hiding empty sections', () => {
    render(
      <MemoryRouter initialEntries={['/p/friend']}>
        <I18nProvider>
          <Routes>
            <Route path="/p/:userId" element={<FriendListScreen />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>,
    );

    // Priority-1 and priority-3 headers present (items exist in those buckets).
    expect(screen.getByText('Очень хочу')).toBeTruthy();
    expect(screen.getByText('Если найдётся')).toBeTruthy();

    // Priority-2 bucket is empty → header hidden.
    expect(screen.queryByText('Хочу')).toBeNull();
  });

  it('renders item.note inline under the row title', () => {
    render(
      <MemoryRouter initialEntries={['/p/friend']}>
        <I18nProvider>
          <Routes>
            <Route path="/p/:userId" element={<FriendListScreen />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>,
    );

    // Note from the mock data — friend's «прикольный коммент» should be
    // visible in the row preview without needing to click into the detail.
    expect(screen.getByText('обязательно в твёрдой обложке')).toBeTruthy();
  });

  it('renders no drag handles (read-only view)', () => {
    render(
      <MemoryRouter initialEntries={['/p/friend']}>
        <I18nProvider>
          <Routes>
            <Route path="/p/:userId" element={<FriendListScreen />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>,
    );

    expect(screen.queryAllByTestId('drag-handle')).toHaveLength(0);
  });
});

describe('<FriendListScreen> category filter', () => {
  beforeEach(() => {
    // Clear all persistence so neither sortMode nor viewMode leaks
    // between tests (the SortSelector + ViewToggle write to localStorage
    // on click — that state would otherwise carry over and silently
    // change the rendered list shape).
    localStorage.clear();
    localStorage.setItem('kryska.lang', 'ru');
    localStorage.setItem('kryska.viewMode', 'list');
  });

  function renderRoute() {
    return render(
      <MemoryRouter initialEntries={['/p/friend']}>
        <I18nProvider>
          <Routes>
            <Route path="/p/:userId" element={<FriendListScreen />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>,
    );
  }

  it('shows the full list when the "Все" chip is active (default)', () => {
    fixture.items = [
      makeFriendItem({ id: 'a', priority: 1, title: 'Тарелка', category: 'Кухня' }),
      makeFriendItem({ id: 'b', priority: 2, title: 'Носки', category: 'Одежда' }),
    ];
    renderRoute();

    // Both items visible.
    expect(screen.getByText('Тарелка')).toBeTruthy();
    expect(screen.getByText('Носки')).toBeTruthy();

    // The category "Все" chip is pressed by default (not the occasion
    // filter's lowercase "все").
    const chipAll = screen.getByRole('button', { name: /^Все$/ });
    expect(chipAll.getAttribute('aria-pressed')).toBe('true');
  });

  it('narrows the list to the picked category', () => {
    fixture.items = [
      makeFriendItem({ id: 'a', priority: 1, title: 'Тарелка', category: 'Кухня' }),
      makeFriendItem({ id: 'b', priority: 2, title: 'Носки', category: 'Одежда' }),
    ];
    renderRoute();

    fireEvent.click(screen.getByRole('button', { name: /Кухня/i }));
    expect(screen.getByText('Тарелка')).toBeTruthy();
    expect(screen.queryByText('Носки')).toBeNull();
  });

  it('composes with sort=price: flat list, only filtered items', () => {
    fixture.items = [
      makeFriendItem({
        id: 'a',
        priority: 1,
        title: 'Дорогая тарелка',
        category: 'Кухня',
        price_text: '50',
      }),
      makeFriendItem({
        id: 'b',
        priority: 2,
        title: 'Дешёвая чашка',
        category: 'Кухня',
        price_text: '20',
      }),
      makeFriendItem({
        id: 'c',
        priority: 3,
        title: 'Носки',
        category: 'Одежда',
        price_text: '5',
      }),
    ];
    renderRoute();

    // Switch sort to "цена" (price).
    fireEvent.click(screen.getByRole('button', { name: /^цена$/ }));
    // Filter to "Кухня".
    fireEvent.click(screen.getByRole('button', { name: /Кухня/i }));

    // Only kitchen items visible.
    expect(screen.queryByText('Носки')).toBeNull();

    // Section headers should NOT appear (flat order when sort !== priority).
    expect(screen.queryByText('Очень хочу')).toBeNull();
    expect(screen.queryByText('Если найдётся')).toBeNull();

    // Both kitchen items visible.
    expect(screen.getByText('Дешёвая чашка')).toBeTruthy();
    expect(screen.getByText('Дорогая тарелка')).toBeTruthy();
  });

  it('hides empty priority sections when category filter is active', () => {
    fixture.items = [
      // Only kitchen items at priority 1 — sections 2 + 3 should be hidden
      // for the filtered view, even though "Носки" would otherwise live at 2.
      makeFriendItem({ id: 'a', priority: 1, title: 'Тарелка', category: 'Кухня' }),
      makeFriendItem({ id: 'b', priority: 2, title: 'Носки', category: 'Одежда' }),
      makeFriendItem({ id: 'c', priority: 3, title: 'Книга', category: 'Одежда' }),
    ];
    renderRoute();

    fireEvent.click(screen.getByRole('button', { name: /Кухня/i }));

    // Only the priority-1 section header shows.
    expect(screen.getByText('Очень хочу')).toBeTruthy();
    expect(screen.queryByText('Хочу')).toBeNull();
    expect(screen.queryByText('Если найдётся')).toBeNull();
  });

  it('does not render the chip row when nothing is categorised', () => {
    fixture.items = [
      makeFriendItem({ id: 'a', priority: 1, title: 'A', category: null }),
      makeFriendItem({ id: 'b', priority: 2, title: 'B', category: null }),
    ];
    renderRoute();

    // No chip row → no category "Все" button.
    expect(screen.queryByRole('button', { name: /^Все$/ })).toBeNull();
  });
});
