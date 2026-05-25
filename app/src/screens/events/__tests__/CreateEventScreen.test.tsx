// app/src/screens/events/__tests__/CreateEventScreen.test.tsx
//
// Phase C scope: the audience/circle picker is dead UI (it never wired
// into useEvents.createEvent, which doesn't accept circle_ids in the
// link-first model). These tests pin the simplification: no audience
// fieldset in the DOM; submit navigates to /events/:id?share=1 so the
// next screen can render the post-create share card.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useEvents: vi.fn(),
  useGroups: vi.fn(),
  useMyItems: vi.fn(),
  navigate: vi.fn(),
  createEvent: vi.fn(),
}));

vi.mock('../../../auth/useAuth', () => ({ useAuth: mocks.useAuth }));
vi.mock('../../../events/useEvents', () => ({ useEvents: mocks.useEvents }));
vi.mock('../../../groups/useGroups', () => ({ useGroups: mocks.useGroups }));
vi.mock('../../../items/useMyItems', () => ({ useMyItems: mocks.useMyItems }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock('../../../lib/plausible', () => ({ track: vi.fn() }));

import { I18nProvider } from '../../../i18n';
import { CreateEventScreen } from '../CreateEventScreen';

function renderScreen() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <CreateEventScreen />
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.useAuth.mockReturnValue({
    status: 'authenticated',
    user: { id: 'u1' },
    session: null,
    signInWithMagicLink: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  });
  mocks.createEvent.mockReset();
  mocks.useEvents.mockReturnValue({
    query: { status: 'ready', events: [], error: null },
    refresh: vi.fn(),
    createEvent: mocks.createEvent,
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
  });
  mocks.useGroups.mockReturnValue({
    query: { status: 'ready', groups: [{ id: 'g1', name: 'Test Circle', emoji: null }] },
  });
  mocks.useMyItems.mockReturnValue({
    query: { status: 'ready', items: [] },
  });
  mocks.navigate.mockReset();
});

describe('CreateEventScreen', () => {
  it('does not render any audience/circle picker', () => {
    renderScreen();
    // The previous flow had a fieldset legend "кто увидит" / "audience".
    expect(screen.queryByText(/audience|кто увидит/i)).toBeNull();
    // And no chip for the seeded group name (would render if the picker
    // was still wired).
    expect(screen.queryByText('Test Circle')).toBeNull();
  });

  it('navigates to /events/:id?share=1 on successful create', async () => {
    mocks.createEvent.mockResolvedValueOnce({
      event: {
        id: 'e1',
        honoree_id: 'u1',
        title: 'Test',
        kind: 'birthday',
        occurs_on: null,
        note: null,
        share_token: 'tok',
      },
    });

    renderScreen();

    // Fill the title (required), submit.
    const titleInput = screen.getByPlaceholderText(/my birthday|др мышки/i);
    fireEvent.change(titleInput, { target: { value: 'Test' } });
    const submit = screen.getByRole('button', { name: /create|создать/i });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(mocks.createEvent).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith('/events/e1?share=1', { replace: true });
    });
  });
});
