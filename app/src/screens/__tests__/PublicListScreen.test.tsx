// app/src/screens/__tests__/PublicListScreen.test.tsx
//
// Task 10: PublicListScreen sections items by priority (read-only).
// Task 8 (PR 2): + CategoryChips filter integration.
// PublicListScreen uses inline supabase.rpc() — no custom hook —
// so we mock the supabase client directly.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '../../i18n';

// supabase mock: rpc returns a resolved promise with owner + items.
// Items at priority 1 and 2; priority 3 (low) bucket is empty.
// Use vi.hoisted so mocks are available when vi.mock factories run.
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: mocks.rpc },
}));

// ReportDialog (rendered in the Footer) calls useAuth.
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));

import { PublicListScreen } from '../PublicListScreen';

interface MakeItemOverrides {
  category?: string | null;
  price_text?: string | null;
}

const makeItem = (
  id: string,
  priority: number,
  title: string,
  overrides: MakeItemOverrides = {},
) => ({
  id,
  title,
  priority,
  maker: null,
  url: null,
  price_text: overrides.price_text ?? null,
  occasion: 'anytime',
  note: null,
  cover_url: null,
  created_at: '2026-01-01T00:00:00Z',
  category: overrides.category ?? null,
});

const owner = { display_name: 'Мышка', handle: null, avatar_url: null };

const items = [
  makeItem('a', 1, 'Книга'),
  makeItem('b', 2, 'Кружка'),
];

function mockRpcWith(payload: { items: ReturnType<typeof makeItem>[] }) {
  mocks.rpc.mockReturnValue(
    Promise.resolve({
      data: [{ owner, items: payload.items }],
      error: null,
    }),
  );
}

describe('<PublicListScreen> sectioning', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('kryska.lang', 'ru');
    // Section headers only render in list view; grid is the jsdom default.
    localStorage.setItem('kryska.viewMode', 'list');
    mocks.rpc.mockReturnValue(
      Promise.resolve({
        data: [{ owner, items }],
        error: null,
      }),
    );
  });

  it('groups items by priority with section headers, hiding empty sections', async () => {
    render(
      <MemoryRouter initialEntries={['/share/abcd']}>
        <I18nProvider>
          <Routes>
            <Route path="/share/:token" element={<PublicListScreen />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>,
    );

    // Wait for async rpc() to resolve and state to update.
    expect(await screen.findByText('Книга')).toBeTruthy();

    // Priority-1 and priority-2 headers visible.
    expect(screen.getByText('Очень хочу')).toBeTruthy();
    expect(screen.getByText('Хочу')).toBeTruthy();

    // Priority-3 bucket is empty → header hidden.
    expect(screen.queryByText('Если найдётся')).toBeNull();

    // Both items rendered.
    expect(screen.getByText('Кружка')).toBeTruthy();
  });

  it('renders zero drag handles (read-only view)', async () => {
    render(
      <MemoryRouter initialEntries={['/share/abcd']}>
        <I18nProvider>
          <Routes>
            <Route path="/share/:token" element={<PublicListScreen />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>,
    );

    // Wait for items to render.
    await screen.findByText('Книга');

    expect(screen.queryAllByTestId('drag-handle')).toHaveLength(0);
  });
});

describe('<PublicListScreen> category filter', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('kryska.lang', 'ru');
    localStorage.setItem('kryska.viewMode', 'list');
  });

  function renderRoute() {
    return render(
      <MemoryRouter initialEntries={['/share/abcd']}>
        <I18nProvider>
          <Routes>
            <Route path="/share/:token" element={<PublicListScreen />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>,
    );
  }

  it('All chip shows the full item list (default)', async () => {
    mockRpcWith({
      items: [
        makeItem('a', 1, 'Тарелка', { category: 'Кухня' }),
        makeItem('b', 2, 'Носки', { category: 'Одежда' }),
      ],
    });
    renderRoute();

    // Wait for async rpc() to settle.
    await screen.findByText('Тарелка');
    expect(screen.getByText('Носки')).toBeTruthy();

    // "Все" chip (capital "В") active by default.
    const chipAll = screen.getByRole('button', { name: /^Все$/ });
    expect(chipAll.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking a category chip narrows the list to that category', async () => {
    mockRpcWith({
      items: [
        makeItem('a', 1, 'Тарелка', { category: 'Кухня' }),
        makeItem('b', 2, 'Носки', { category: 'Одежда' }),
      ],
    });
    renderRoute();

    await screen.findByText('Тарелка');
    fireEvent.click(screen.getByRole('button', { name: /Кухня/i }));

    expect(screen.getByText('Тарелка')).toBeTruthy();
    expect(screen.queryByText('Носки')).toBeNull();
  });

  it('composes with sort=price: flat order, only filtered items', async () => {
    mockRpcWith({
      items: [
        makeItem('a', 1, 'Дорогая тарелка', { category: 'Кухня', price_text: '50' }),
        makeItem('b', 2, 'Дешёвая чашка', { category: 'Кухня', price_text: '20' }),
        makeItem('c', 3, 'Носки', { category: 'Одежда', price_text: '5' }),
      ],
    });
    renderRoute();

    await screen.findByText('Дешёвая чашка');

    // Sort by price (flat order, cheapest first).
    fireEvent.click(screen.getByRole('button', { name: /^цена$/ }));
    // Filter to Кухня.
    fireEvent.click(screen.getByRole('button', { name: /Кухня/i }));

    // Section headers must not appear (sort !== priority).
    expect(screen.queryByText('Очень хочу')).toBeNull();
    expect(screen.queryByText('Хочу')).toBeNull();
    expect(screen.queryByText('Если найдётся')).toBeNull();

    // Non-kitchen item hidden.
    expect(screen.queryByText('Носки')).toBeNull();

    // Both kitchen items visible.
    expect(screen.getByText('Дешёвая чашка')).toBeTruthy();
    expect(screen.getByText('Дорогая тарелка')).toBeTruthy();
  });

  it('does not render the chip row when no items are categorised', async () => {
    // Items WITHOUT category — current RPC payload shape until the
    // composite type is extended in a future migration.
    mockRpcWith({
      items: [makeItem('a', 1, 'Книга'), makeItem('b', 2, 'Кружка')],
    });
    renderRoute();

    await screen.findByText('Книга');

    // No CategoryChips row → no "Все" (capital) button.
    expect(screen.queryByRole('button', { name: /^Все$/ })).toBeNull();
  });
});
