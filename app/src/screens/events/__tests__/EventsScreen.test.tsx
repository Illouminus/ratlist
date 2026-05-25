// app/src/screens/events/__tests__/EventsScreen.test.tsx
//
// Phase D pending UX: for events the caller is invited to but hasn't
// accepted yet (my_status='pending'), render an "invitation from X"
// badge with inline Accept / Decline buttons. Accept calls
// join_event_via_token + navigates. Decline UPDATEs the participant row
// to status='declined'.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useEvents: vi.fn(),
  useAuth: vi.fn(),
  rpc: vi.fn(),
  fromUpdateChain: vi.fn(),
  navigate: vi.fn(),
  toastShow: vi.fn(),
  useToast: vi.fn(),
}));

vi.mock('../../../events/useEvents', () => ({ useEvents: mocks.useEvents }));
vi.mock('../../../auth/useAuth', () => ({ useAuth: mocks.useAuth }));
vi.mock('../../../components/useToast', () => ({ useToast: mocks.useToast }));
vi.mock('../../../lib/plausible', () => ({ track: vi.fn() }));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: vi.fn().mockImplementation(() => ({
      update: mocks.fromUpdateChain,
    })),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

import { I18nProvider } from '../../../i18n';
import { EventsScreen } from '../EventsScreen';

function stubEvents(
  events: Array<{
    id: string;
    title: string;
    my_status: 'honoree' | 'active' | 'pending';
    share_token: string;
    honoree_display_name?: string;
    item_count?: number;
    occurs_on?: string | null;
    kind?: string;
    participant_count?: number;
  }>,
) {
  mocks.useEvents.mockReturnValue({
    query: {
      status: 'ready',
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        kind: e.kind ?? 'birthday',
        my_status: e.my_status,
        share_token: e.share_token,
        honoree_id: e.my_status === 'honoree' ? 'u-me' : 'u-other',
        honoree_display_name: e.honoree_display_name ?? 'Tanya',
        honoree_handle: null,
        honoree_avatar_url: null,
        occurs_on: e.occurs_on ?? null,
        note: null,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
        item_count: e.item_count ?? 0,
        participant_count: e.participant_count ?? 0,
      })),
      error: null,
    },
    refresh: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
  });
}

function renderScreen() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <EventsScreen />
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.useEvents.mockReset();
  mocks.rpc.mockReset();
  mocks.fromUpdateChain.mockReset();
  mocks.navigate.mockReset();
  mocks.toastShow.mockReset();
  mocks.useAuth.mockReturnValue({
    status: 'authenticated',
    user: { id: 'u-me' },
    session: null,
    signInWithMagicLink: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  });
  mocks.useToast.mockReturnValue({ show: mocks.toastShow });
});

describe('EventsScreen — pending UX', () => {
  it('pending events render with invite badge + accept/decline buttons', () => {
    stubEvents([
      {
        id: 'e-pending',
        title: 'Surprise BD',
        my_status: 'pending',
        share_token: 'tok-e-pending',
        honoree_display_name: 'Tanya',
      },
    ]);

    renderScreen();

    screen.getByText('Surprise BD');
    expect(screen.getByText(/invitation from|приглашение от/i)).toBeTruthy();
    screen.getByRole('button', { name: /accept|принять/i });
    screen.getByRole('button', { name: /decline|отклонить/i });
  });

  it('non-pending events do NOT show accept/decline buttons', () => {
    stubEvents([
      {
        id: 'e-active',
        title: 'Joined party',
        my_status: 'active',
        share_token: 'tok-active',
      },
      {
        id: 'e-mine',
        title: 'My party',
        my_status: 'honoree',
        share_token: 'tok-mine',
      },
    ]);

    renderScreen();

    expect(screen.queryByRole('button', { name: /accept|принять/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /decline|отклонить/i })).toBeNull();
  });

  it('Accept → join_event_via_token + navigate to /events/:id', async () => {
    stubEvents([
      {
        id: 'e-pending',
        title: 'X',
        my_status: 'pending',
        share_token: 'tok-e-pending',
      },
    ]);
    mocks.rpc.mockResolvedValueOnce({ data: 'e-pending', error: null });

    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: /accept|принять/i }));

    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith('join_event_via_token', {
        _token: 'tok-e-pending',
      });
    });
    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith('/events/e-pending');
    });
  });

  it('Decline → UPDATE event_participants set status=declined', async () => {
    stubEvents([
      {
        id: 'e-pending',
        title: 'X',
        my_status: 'pending',
        share_token: 'tok-e-pending',
      },
    ]);
    const inner = vi
      .fn()
      .mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mocks.fromUpdateChain.mockReturnValue({ eq: inner });

    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: /decline|отклонить/i }));

    await waitFor(() => {
      expect(mocks.fromUpdateChain).toHaveBeenCalledWith({ status: 'declined' });
    });
  });
});
