// app/src/screens/__tests__/PublicListScreen.test.tsx
//
// Task 10: PublicListScreen sections items by priority (read-only).
// PublicListScreen uses inline supabase.rpc() — no custom hook —
// so we mock the supabase client directly.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

const makeItem = (id: string, priority: number, title: string) => ({
  id,
  title,
  priority,
  maker: null,
  url: null,
  price_text: null,
  occasion: 'anytime',
  note: null,
  cover_url: null,
  created_at: '2026-01-01T00:00:00Z',
});

const owner = { display_name: 'Мышка', handle: null, avatar_url: null };

const items = [
  makeItem('a', 1, 'Книга'),
  makeItem('b', 2, 'Кружка'),
];

describe('<PublicListScreen> sectioning', () => {
  beforeEach(() => {
    localStorage.setItem('kryska.lang', 'ru');
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
