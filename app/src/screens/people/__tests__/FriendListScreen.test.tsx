// app/src/screens/people/__tests__/FriendListScreen.test.tsx
//
// Task 11: FriendListScreen sections items by priority (read-only).
// FriendListScreen uses useFriendList, useEvents, and useAuth.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '../../../i18n';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

vi.mock('../../../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'viewer' }, session: null, status: 'authenticated' }),
}));

vi.mock('../../../events/useEvents', () => ({
  useEvents: () => ({ query: { status: 'loading', events: [] } }),
}));

vi.mock('../../../people/useFriendList', () => ({
  useFriendList: () => ({
    query: {
      status: 'ready',
      items: [
        {
          id: 'a',
          priority: 1,
          title: 'Книга',
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
          claims: [],
        },
        {
          id: 'c',
          priority: 3,
          title: 'Носки',
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
          claims: [],
        },
      ],
      profile: { id: 'friend', display_name: 'Друг', handle: null, avatar_url: null },
      error: null,
    },
    claim: vi.fn(),
    release: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { FriendListScreen } from '../FriendListScreen';

describe('<FriendListScreen> sectioning', () => {
  beforeEach(() => {
    localStorage.setItem('kryska.lang', 'ru');
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
