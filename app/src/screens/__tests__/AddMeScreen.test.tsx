// app/src/screens/__tests__/AddMeScreen.test.tsx
//
// Post-auth add-me flow (smoke #2/#3):
//   #3 — a freshly-signed-up (not-yet-onboarded) visitor is routed to
//        onboarding FIRST (name), then back here. /add-me is a public route
//        so the AuthedShell onboarding gate never fires — AddMeScreen does it.
//   #2 — an onboarded visitor sees the accept CTA AND a "not now" escape
//        that drops them on home without friending.
//
// Uses real MemoryRouter navigation (not a mocked useNavigate) + probe
// routes so we assert where the user actually lands. The full sign-in
// round-trip is covered by a manual smoke step in the PR.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useProfile: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../../auth/useAuth', () => ({ useAuth: mocks.useAuth }));
vi.mock('../../auth/useProfile', () => ({ useProfile: mocks.useProfile }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('../../lib/plausible', () => ({ track: vi.fn() }));

import { I18nProvider } from '../../i18n';
import { AddMeScreen } from '../AddMeScreen';

function renderAt(onboarded_at: string | null) {
  mocks.useProfile.mockReturnValue({
    query: {
      status: 'ready',
      profile: {
        id: 'me',
        display_name: 'Me',
        handle: null,
        avatar_url: null,
        onboarded_at,
        disabled_at: null,
        created_at: '',
        updated_at: '',
      },
    },
    refresh: vi.fn(),
  });
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/add-me/tok-123']}>
        <Routes>
          <Route path="/add-me/:token" element={<AddMeScreen />} />
          <Route path="/onboarding" element={<div data-testid="onboarding-page" />} />
          <Route path="/" element={<div data-testid="home-page" />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'ru');
  mocks.useAuth.mockReturnValue({
    status: 'authenticated',
    user: { id: 'me' },
    session: null,
    signInWithMagicLink: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  });
  // get_add_me_preview → empty (nameless title); accept_add_me unused here.
  mocks.rpc.mockResolvedValue({ data: [], error: null });
});

describe('<AddMeScreen> post-auth flow', () => {
  it('#3: a not-yet-onboarded visitor is routed to onboarding first', async () => {
    renderAt(null);
    expect(await screen.findByTestId('onboarding-page')).toBeTruthy();
  });

  it('#2: an onboarded visitor sees accept + a "not now" that goes home', async () => {
    renderAt('2026-01-01T00:00:00Z');
    expect(screen.getByRole('button', { name: /подружиться/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /не сейчас/i }));
    expect(await screen.findByTestId('home-page')).toBeTruthy();
  });
});
