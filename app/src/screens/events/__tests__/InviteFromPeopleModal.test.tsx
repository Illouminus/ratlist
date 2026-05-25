// app/src/screens/events/__tests__/InviteFromPeopleModal.test.tsx
//
// The coordinator picks people from a checklist; submit fires
// invite_to_event (RPC) + send-event-invite (Edge Function, fire-and-
// forget) and shows a toast with the count. Empty state when usePeople
// returns no one.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  usePeople: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock('../../../people/usePeople', () => ({ usePeople: mocks.usePeople }));

import { I18nProvider } from '../../../i18n';
import { InviteFromPeopleModal } from '../InviteFromPeopleModal';

function stubPeople(
  people: Array<{
    id: string;
    display_name: string;
    handle: string | null;
    avatar_url: string | null;
    has_public_list: boolean;
    last_interaction_at: string | null;
  }>,
): void {
  mocks.usePeople.mockReturnValue({
    query: { status: 'ready', people, error: null },
    refresh: vi.fn(),
  });
}

beforeEach(() => {
  localStorage.clear();
  mocks.rpc.mockReset();
  mocks.invoke.mockReset();
  mocks.usePeople.mockReset();
});

describe('InviteFromPeopleModal', () => {
  it('does not render when closed', () => {
    stubPeople([]);
    const onClose = vi.fn();
    const showToast = vi.fn();
    render(
      <I18nProvider>
        <InviteFromPeopleModal eventId="e1" open={false} onClose={onClose} showToast={showToast} />
      </I18nProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('selects two friends → submit → rpc + edge function called + toast count', async () => {
    stubPeople([
      {
        id: 'p1',
        display_name: 'Таня',
        handle: 'tanya',
        avatar_url: null,
        has_public_list: true,
        last_interaction_at: '2026-05-20T10:00:00Z',
      },
      {
        id: 'p2',
        display_name: 'Миша',
        handle: 'misha',
        avatar_url: null,
        has_public_list: false,
        last_interaction_at: '2026-05-10T10:00:00Z',
      },
    ]);
    mocks.rpc.mockResolvedValueOnce({ data: 2, error: null });
    mocks.invoke.mockResolvedValueOnce({ data: { ok: true, sent: 2, skipped: 0 }, error: null });

    const onClose = vi.fn();
    const showToast = vi.fn();
    render(
      <I18nProvider>
        <InviteFromPeopleModal eventId="e1" open={true} onClose={onClose} showToast={showToast} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByLabelText('Таня'));
    fireEvent.click(screen.getByLabelText('Миша'));
    const submit = screen.getByRole('button', { name: /invite 2|позвать 2/i });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith('invite_to_event', {
        _event_id: 'e1',
        _user_ids: ['p1', 'p2'],
      });
    });
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith('send-event-invite', {
        body: { event_id: 'e1', user_ids: ['p1', 'p2'] },
      });
    });
    await waitFor(() => {
      expect(showToast).toHaveBeenCalled();
    });
    expect(onClose).toHaveBeenCalled();
    // Toast text should include the count
    const toastArg = String(showToast.mock.calls[0]?.[0] ?? '');
    expect(toastArg).toMatch(/2/);
  });

  it('renders empty state when usePeople returns no one', () => {
    stubPeople([]);
    render(
      <I18nProvider>
        <InviteFromPeopleModal eventId="e1" open={true} onClose={vi.fn()} showToast={vi.fn()} />
      </I18nProvider>,
    );
    expect(
      screen.getByText(/no one yet|пока никого нет/i),
    ).toBeTruthy();
  });

  it('does NOT call edge function when invite_to_event RPC errors', async () => {
    stubPeople([
      {
        id: 'p1',
        display_name: 'Таня',
        handle: 'tanya',
        avatar_url: null,
        has_public_list: true,
        last_interaction_at: null,
      },
    ]);
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'forbidden', code: '42501' },
    });

    const showToast = vi.fn();
    const onClose = vi.fn();
    render(
      <I18nProvider>
        <InviteFromPeopleModal eventId="e1" open={true} onClose={onClose} showToast={showToast} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByLabelText('Таня'));
    fireEvent.click(screen.getByRole('button', { name: /invite|позвать/i }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalled();
    });
    expect(mocks.invoke).not.toHaveBeenCalled();
    // Modal stays open on error so the user sees the toast and can retry
    expect(onClose).not.toHaveBeenCalled();
  });
});
