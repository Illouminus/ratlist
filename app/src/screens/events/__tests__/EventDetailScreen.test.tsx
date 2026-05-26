// app/src/screens/events/__tests__/EventDetailScreen.test.tsx
//
// Phase C scope: the post-create celebratory share card via ?share=1.
// Phase D scope: the always-on coordinator panel — permanent share
// link + copy button + invite button + participants section. The two
// surfaces coexist: ?share=1 adds the celebration headline + dismiss
// on top of the always-on panel.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useEvent: vi.fn(),
  useEventParticipants: vi.fn(),
  useGroups: vi.fn(),
  useMyItems: vi.fn(),
  usePeople: vi.fn(),
  useAuth: vi.fn(),
  useToast: vi.fn(),
  useConfirm: vi.fn(),
  writeText: vi.fn(),
  toastShow: vi.fn(),
}));

vi.mock('../../../events/useEvent', () => ({ useEvent: mocks.useEvent }));
vi.mock('../../../events/useEventParticipants', () => ({
  useEventParticipants: mocks.useEventParticipants,
}));
vi.mock('../../../groups/useGroups', () => ({ useGroups: mocks.useGroups }));
vi.mock('../../../items/useMyItems', () => ({ useMyItems: mocks.useMyItems }));
vi.mock('../../../people/usePeople', () => ({ usePeople: mocks.usePeople }));
vi.mock('../../../auth/useAuth', () => ({ useAuth: mocks.useAuth }));
vi.mock('../../../components/useToast', () => ({ useToast: mocks.useToast }));
vi.mock('../../../components/useConfirm', () => ({ useConfirm: mocks.useConfirm }));
vi.mock('../../../lib/plausible', () => ({ track: vi.fn() }));

// supabase.ts throws at module-load time when env vars are missing (CI
// without .env.local). EventDetailScreen imports InviteFromPeopleModal,
// which imports supabase directly. We never exercise the supabase
// client in these tests (all data goes through mocked hooks), so a
// no-op stub is enough.
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    functions: { invoke: vi.fn() },
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

import { I18nProvider } from '../../../i18n';
import { EventDetailScreen } from '../EventDetailScreen';

const honoreeEvent = {
  id: 'e1',
  honoree_id: 'u-honoree',
  title: 'Birthday',
  kind: 'birthday',
  occurs_on: null,
  note: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  share_token: 'abc123def456',
};

function stubHonoree() {
  mocks.useEvent.mockReturnValue({
    query: {
      status: 'ready',
      data: { event: honoreeEvent, audience: [], items: [], isHonoree: true },
      error: null,
    },
    refresh: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    attachCircle: vi.fn(),
    detachCircle: vi.fn(),
    attachItem: vi.fn(),
    detachItem: vi.fn(),
    claim: vi.fn(),
    release: vi.fn(),
  });
}

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/events/:eventId" element={<EventDetailScreen />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.useEvent.mockReset();
  mocks.useEventParticipants.mockReturnValue({
    query: { status: 'ready', participants: [], error: null },
    refresh: vi.fn(),
  });
  mocks.useGroups.mockReturnValue({
    query: { status: 'ready', groups: [] },
  });
  mocks.useMyItems.mockReturnValue({
    query: { status: 'ready', items: [] },
  });
  mocks.usePeople.mockReturnValue({
    query: { status: 'ready', people: [], error: null },
    refresh: vi.fn(),
  });
  mocks.useAuth.mockReturnValue({
    status: 'authenticated',
    user: { id: 'u-honoree' },
    session: null,
    signInWithMagicLink: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  });
  mocks.toastShow.mockReset();
  mocks.useToast.mockReturnValue({ show: mocks.toastShow });
  mocks.useConfirm.mockReturnValue(vi.fn());

  // Mock navigator.clipboard.writeText — jsdom doesn't provide it.
  mocks.writeText.mockReset();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mocks.writeText },
    configurable: true,
  });
});

describe('EventDetailScreen — post-create share card (?share=1)', () => {
  it('renders celebratory headline + URL + copy button when ?share=1 and honoree', () => {
    stubHonoree();
    renderAt('/events/e1?share=1');

    // The transient celebration headline only appears with ?share=1
    screen.getByText(/ready|готово/i);
    // ShareCard surfaces the URL + its own Copy button. The new inline
    // share-meta line is suppressed during ?share=1 so the user doesn't
    // see the same affordance twice.
    expect(screen.getAllByText(/abc123def456/)).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /copy|скопировать/i })).toHaveLength(1);
    // Invite is reachable from the regular page (after dismissing the
    // celebration card). The transient card itself doesn't carry an
    // invite button.
  });

  it('does NOT render celebration headline without ?share=1', () => {
    stubHonoree();
    renderAt('/events/e1');

    // The celebration "Ready!" headline is gone, but the always-on share
    // link is still visible (D.4) — assert headline absence specifically.
    expect(screen.queryByText(/^ready$|^готово!?$/i)).toBeNull();
  });

  it('does NOT render any share card for non-honoree', () => {
    mocks.useEvent.mockReturnValue({
      query: {
        status: 'ready',
        data: { event: honoreeEvent, audience: [], items: [], isHonoree: false },
        error: null,
      },
      refresh: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      attachCircle: vi.fn(),
      detachCircle: vi.fn(),
      attachItem: vi.fn(),
      detachItem: vi.fn(),
      claim: vi.fn(),
      release: vi.fn(),
    });
    mocks.useAuth.mockReturnValue({
      status: 'authenticated',
      user: { id: 'u-guest' },
      session: null,
      signInWithMagicLink: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    });

    renderAt('/events/e1?share=1');

    expect(screen.queryByText(/abc123def456/)).toBeNull();
  });

  it('copy button writes the public URL to the clipboard', () => {
    stubHonoree();
    renderAt('/events/e1?share=1');

    // Multiple copy buttons may exist (post-create + always-on coordinator).
    // Click the first one — both write the same URL.
    const copyButtons = screen.getAllByRole('button', { name: /copy|скопировать/i });
    fireEvent.click(copyButtons[0]!);

    expect(mocks.writeText).toHaveBeenCalled();
    const written = mocks.writeText.mock.calls[0]?.[0];
    expect(String(written)).toContain('/event/abc123def456');
  });
});

describe('<EventDetailScreen> sectioning', () => {
  function curated(id: string, priority: 1 | 2 | 3, title: string) {
    return {
      item_id: id,
      added_at: '2026-05-26T00:00:00Z',
      claims: [],
      item: {
        id,
        priority,
        title,
        owner_id: 'honoree',
        occasion: 'anytime',
        maker: null,
        url: null,
        price_text: null,
        note: null,
        cover_url: null,
        status: 'open',
        created_at: '',
        updated_at: '',
      },
    };
  }

  function stubWithItems(
    items: ReturnType<typeof curated>[],
    isHonoree: boolean,
  ) {
    mocks.useEvent.mockReturnValue({
      query: {
        status: 'ready',
        data: {
          event: honoreeEvent,
          audience: [],
          items,
          isHonoree,
        },
        error: null,
      },
      refresh: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      attachCircle: vi.fn(),
      detachCircle: vi.fn(),
      attachItem: vi.fn(),
      detachItem: vi.fn(),
      claim: vi.fn(),
      release: vi.fn(),
    });
  }

  it('honoree view: sections curated items by priority with no drag handles', () => {
    localStorage.setItem('kryska.lang', 'ru');
    stubWithItems(
      [curated('a', 1, 'Книга'), curated('b', 2, 'Кружка')],
      true,
    );

    renderAt('/events/e1');

    expect(screen.getByText('Очень хочу')).toBeTruthy();
    expect(screen.getByText('Хочу')).toBeTruthy();
    expect(screen.queryByText('Если найдётся')).toBeNull(); // empty bucket → hidden
    expect(screen.getByText('Книга')).toBeTruthy();
    expect(screen.getByText('Кружка')).toBeTruthy();
    expect(screen.queryAllByTestId('drag-handle')).toHaveLength(0);
  });

  it('guest view: sections curated items read-only', () => {
    localStorage.setItem('kryska.lang', 'ru');
    stubWithItems(
      [curated('a', 1, 'Книга'), curated('c', 3, 'Носки')],
      false,
    );
    mocks.useAuth.mockReturnValue({
      status: 'authenticated',
      user: { id: 'u-guest' },
      session: null,
      signInWithMagicLink: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    });

    renderAt('/events/e1');

    expect(screen.getByText('Очень хочу')).toBeTruthy();
    expect(screen.getByText('Если найдётся')).toBeTruthy();
    expect(screen.queryByText('Хочу')).toBeNull(); // empty, hidden
    expect(screen.queryAllByTestId('drag-handle')).toHaveLength(0);
  });
});

describe('EventDetailScreen — inline share-meta line (redesign)', () => {
  it('inline share label + copy + invite affordances visible for honoree without ?share=1', () => {
    stubHonoree();
    renderAt('/events/e1');

    // New inline share-meta line replaces the old URL + buttons block.
    // The URL itself is no longer rendered — copy writes it to clipboard.
    expect(screen.queryByText(/abc123def456/)).toBeNull();
    expect(screen.getByText(/ссылка для гостей|share link/i)).toBeTruthy();
    screen.getByRole('button', { name: /copy ↗|скопировать ↗/i });
    screen.getByRole('button', { name: /invite friends →|позвать друзей →/i });
  });

  it('invite button visible for honoree', () => {
    stubHonoree();
    renderAt('/events/e1');

    screen.getByRole('button', { name: /invite friends →|позвать друзей →/i });
  });

  it('invite button NOT visible for non-honoree (active participant)', () => {
    mocks.useEvent.mockReturnValue({
      query: {
        status: 'ready',
        data: { event: honoreeEvent, audience: [], items: [], isHonoree: false },
        error: null,
      },
      refresh: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      attachCircle: vi.fn(),
      detachCircle: vi.fn(),
      attachItem: vi.fn(),
      detachItem: vi.fn(),
      claim: vi.fn(),
      release: vi.fn(),
    });
    mocks.useAuth.mockReturnValue({
      status: 'authenticated',
      user: { id: 'u-bob' },
      session: null,
      signInWithMagicLink: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    });

    renderAt('/events/e1');

    expect(screen.queryByRole('button', { name: /invite friends|позвать друзей/i })).toBeNull();
    // Also no permanent share URL for non-honoree
    expect(screen.queryByText(/abc123def456/)).toBeNull();
  });

  it('participants section renders with status badges for honoree', async () => {
    stubHonoree();
    mocks.useEventParticipants.mockReturnValue({
      query: {
        status: 'ready',
        participants: [
          {
            user_id: 'p1',
            status: 'active',
            joined_at: '2026-05-20T10:00:00Z',
            invited_at: null,
            display_name: 'Tanya',
            handle: 'tanya',
            avatar_url: null,
          },
          {
            user_id: 'p2',
            status: 'pending',
            joined_at: null,
            invited_at: '2026-05-22T10:00:00Z',
            display_name: 'Misha',
            handle: 'misha',
            avatar_url: null,
          },
        ],
        error: null,
      },
      refresh: vi.fn(),
    });

    renderAt('/events/e1');

    await waitFor(() => screen.getByText('Tanya'));
    screen.getByText('Misha');
    // Status badges (RU or EN copy)
    screen.getByText(/joined|участвует/i);
    screen.getByText(/invited|приглашение/i);
  });

  it('clicking invite button opens InviteFromPeopleModal', () => {
    stubHonoree();
    renderAt('/events/e1');

    fireEvent.click(screen.getByRole('button', { name: /invite friends|позвать друзей/i }));
    // Modal renders with its own dialog role
    screen.getByRole('dialog');
  });
});
