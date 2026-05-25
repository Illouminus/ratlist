// app/src/screens/events/__tests__/EventDetailScreen.test.tsx
//
// Phase C scope: the post-create share card. Honoree lands here from
// /events/new via ?share=1; we assert the card renders with the public
// /event/<token> URL and a copy button. Without ?share=1 — no card.
// Other modes (guest claim flow, audience UI) are out of scope for
// this test file; mocks return minimal shapes.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useEvent: vi.fn(),
  useGroups: vi.fn(),
  useMyItems: vi.fn(),
  useAuth: vi.fn(),
  useToast: vi.fn(),
  useConfirm: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('../../../events/useEvent', () => ({ useEvent: mocks.useEvent }));
vi.mock('../../../groups/useGroups', () => ({ useGroups: mocks.useGroups }));
vi.mock('../../../items/useMyItems', () => ({ useMyItems: mocks.useMyItems }));
vi.mock('../../../auth/useAuth', () => ({ useAuth: mocks.useAuth }));
vi.mock('../../../components/useToast', () => ({ useToast: mocks.useToast }));
vi.mock('../../../components/useConfirm', () => ({ useConfirm: mocks.useConfirm }));
vi.mock('../../../lib/plausible', () => ({ track: vi.fn() }));

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
  mocks.useGroups.mockReturnValue({
    query: { status: 'ready', groups: [] },
  });
  mocks.useMyItems.mockReturnValue({
    query: { status: 'ready', items: [] },
  });
  mocks.useAuth.mockReturnValue({
    status: 'authenticated',
    user: { id: 'u-honoree' },
    session: null,
    signInWithMagicLink: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  });
  mocks.useToast.mockReturnValue({ show: vi.fn() });
  mocks.useConfirm.mockReturnValue(vi.fn());

  // Mock navigator.clipboard.writeText — jsdom doesn't provide it.
  mocks.writeText.mockReset();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mocks.writeText },
    configurable: true,
  });
});

describe('EventDetailScreen — post-create share card', () => {
  it('renders share card with /event/<token> link when ?share=1 and viewer is honoree', () => {
    stubHonoree();
    renderAt('/events/e1?share=1');

    // Headline appears
    screen.getByText(/ready|готово/i);
    // The full link is rendered with token
    expect(screen.getByText(/abc123def456/)).toBeTruthy();
    // Copy button is present
    screen.getByRole('button', { name: /copy|скопировать/i });
  });

  it('does NOT render share card without ?share=1', () => {
    stubHonoree();
    renderAt('/events/e1');

    expect(screen.queryByText(/abc123def456/)).toBeNull();
    expect(screen.queryByRole('button', { name: /copy|скопировать/i })).toBeNull();
  });

  it('does NOT render share card for non-honoree even with ?share=1', () => {
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

    const copyBtn = screen.getByRole('button', { name: /copy|скопировать/i });
    fireEvent.click(copyBtn);

    expect(mocks.writeText).toHaveBeenCalled();
    const written = mocks.writeText.mock.calls[0]?.[0];
    expect(String(written)).toContain('/event/abc123def456');
  });
});
