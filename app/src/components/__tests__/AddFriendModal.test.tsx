// app/src/components/__tests__/AddFriendModal.test.tsx
//
// `<AddFriendModal>` packs two friending paths in one dialog:
//   1. email + optional message → `create_friend_invite` RPC →
//      `send-friend-invite` Edge Function → "invitation sent" toast.
//   2. read-only display of the caller's `add_me_token` link with
//      copy-to-clipboard + rotate buttons.
//
// These tests pin the contract: both paths render at once, the email
// submit calls the RPC + Edge Function with the right args, and the
// copy button writes the right URL to the clipboard. Mirrors the
// existing modal/clipboard pattern used elsewhere in the codebase.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  useProfile: vi.fn(),
  toastShow: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
  },
}));
vi.mock('../../auth/useProfile', () => ({ useProfile: mocks.useProfile }));
vi.mock('../useToast', async () => {
  const actual = await vi.importActual<typeof import('../useToast')>('../useToast');
  return { ...actual, useToast: () => ({ show: mocks.toastShow }) };
});

import { I18nProvider } from '../../i18n';
import { AddFriendModal } from '../AddFriendModal';

const PROFILE = {
  id: 'u1',
  display_name: 'Test',
  handle: 'test',
  avatar_url: null,
  onboarded_at: '2026-05-25T00:00:00Z',
  disabled_at: null,
  share_token: null,
  add_me_token: 'add-me-abc123',
  created_at: '2026-05-25T00:00:00Z',
  updated_at: '2026-05-25T00:00:00Z',
};

function renderModal(open = true, onClose = vi.fn()): { onClose: ReturnType<typeof vi.fn> } {
  render(
    <I18nProvider>
      <AddFriendModal open={open} onClose={onClose} />
    </I18nProvider>,
  );
  return { onClose };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'en');
  mocks.rpc.mockReset();
  mocks.invoke.mockReset();
  mocks.toastShow.mockReset();
  mocks.writeText.mockReset();
  mocks.useProfile.mockReturnValue({
    query: { status: 'ready', profile: PROFILE, error: null },
    refresh: vi.fn().mockResolvedValue(undefined),
  });
  // Mock the clipboard API on the (shared) navigator object — jsdom
  // doesn't ship it. `configurable: true` so each test resets cleanly.
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mocks.writeText },
    configurable: true,
    writable: true,
  });
});

describe('<AddFriendModal>', () => {
  it('renders both paths — email input + add-me link visible', () => {
    renderModal();

    // Email path: the email input is rendered. We look for an
    // `<input type="email">` to be unambiguous.
    const emailInput = document.querySelector('input[type="email"]');
    expect(emailInput).not.toBeNull();

    // Optional message input is also rendered.
    expect(screen.getByPlaceholderText(/hey, add yourself/i)).toBeTruthy();

    // Add-me link path: the URL built from the profile token is visible.
    const url = `${window.location.origin}/add-me/add-me-abc123`;
    expect(screen.getByText(url)).toBeTruthy();

    // The copy + rotate controls render.
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /rotate/i })).toBeTruthy();
  });

  it('submit email path calls create_friend_invite + send-friend-invite + toasts + closes', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'token-xyz', error: null });
    mocks.invoke.mockResolvedValueOnce({ data: null, error: null });

    const onClose = vi.fn();
    renderModal(true, onClose);

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'anya@example.com' } });

    const messageInput = screen.getByPlaceholderText(/hey, add yourself/i) as HTMLInputElement;
    fireEvent.change(messageInput, { target: { value: 'hi anya' } });

    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }));

    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith('create_friend_invite', {
        _email: 'anya@example.com',
        _message: 'hi anya',
      });
    });

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith('send-friend-invite', {
        body: { token: 'token-xyz', email: 'anya@example.com' },
      });
    });

    await waitFor(() => {
      expect(mocks.toastShow).toHaveBeenCalledWith('invitation sent');
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('copy button writes the add-me URL to navigator.clipboard', async () => {
    mocks.writeText.mockResolvedValueOnce(undefined);

    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }));

    await waitFor(() => {
      expect(mocks.writeText).toHaveBeenCalledTimes(1);
    });
    expect(mocks.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/add-me/add-me-abc123`,
    );
  });

  it('rotate button calls rotate_add_me_token, refreshes profile, toasts', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    mocks.useProfile.mockReturnValue({
      query: { status: 'ready', profile: PROFILE, error: null },
      refresh,
    });
    mocks.rpc.mockResolvedValueOnce({ data: 'new-token', error: null });

    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /rotate/i }));

    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith('rotate_add_me_token');
    });
    await waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mocks.toastShow).toHaveBeenCalledWith('link rotated');
    });
  });
});
