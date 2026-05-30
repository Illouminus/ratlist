// app/src/components/__tests__/AddFriendModal.test.tsx
//
// `<AddFriendModal>` packs two friending paths in one dialog:
//   1. email + optional message → `create_friend_invite` RPC →
//      `send-friend-invite` Edge Function → "invitation sent" toast.
//   2. read-only display of the caller's `add_me_token` link (read from
//      `profile_secrets`) with copy-to-clipboard + rotate buttons.
//
// These tests pin the contract: both paths render at once, the email
// submit calls the RPC + Edge Function with the right args, the copy
// button writes the right URL, and rotate swaps the displayed link.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  maybeSingle: vi.fn(),
  toastShow: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
    // add-me token is read from profile_secrets via .from().select().maybeSingle()
    from: () => ({ select: () => ({ maybeSingle: mocks.maybeSingle }) }),
  },
}));
vi.mock('../useToast', async () => {
  const actual = await vi.importActual<typeof import('../useToast')>('../useToast');
  return { ...actual, useToast: () => ({ show: mocks.toastShow }) };
});

import { I18nProvider } from '../../i18n';
import { AddFriendModal } from '../AddFriendModal';

const ADD_ME_URL = `${window.location.origin}/add-me/add-me-abc123`;

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
  mocks.maybeSingle.mockReset();
  mocks.maybeSingle.mockResolvedValue({ data: { add_me_token: 'add-me-abc123' }, error: null });
  // Mock the clipboard API on the (shared) navigator object — jsdom
  // doesn't ship it. `configurable: true` so each test resets cleanly.
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mocks.writeText },
    configurable: true,
    writable: true,
  });
});

describe('<AddFriendModal>', () => {
  it('renders both paths — email input + add-me link visible', async () => {
    renderModal();

    // Email path: the email input is rendered.
    const emailInput = document.querySelector('input[type="email"]');
    expect(emailInput).not.toBeNull();
    expect(screen.getByPlaceholderText(/hey, add yourself/i)).toBeTruthy();

    // Add-me link path: the URL built from the profile_secrets token shows
    // once the async self-read resolves.
    expect(await screen.findByText(ADD_ME_URL)).toBeTruthy();
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

    // Wait for the token to load so addMeUrl is populated before copying.
    await screen.findByText(ADD_ME_URL);
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }));

    await waitFor(() => {
      expect(mocks.writeText).toHaveBeenCalledTimes(1);
    });
    expect(mocks.writeText).toHaveBeenCalledWith(ADD_ME_URL);
  });

  it('rotate button calls rotate_add_me_token, updates the link, toasts', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'new-token', error: null });
    renderModal();

    await screen.findByText(ADD_ME_URL);
    fireEvent.click(screen.getByRole('button', { name: /rotate/i }));

    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith('rotate_add_me_token');
    });
    // The displayed link updates to the rotated token.
    expect(await screen.findByText(`${window.location.origin}/add-me/new-token`)).toBeTruthy();
    await waitFor(() => {
      expect(mocks.toastShow).toHaveBeenCalledWith('link rotated');
    });
  });
});
