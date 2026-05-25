// app/src/screens/__tests__/OnboardingScreen.test.tsx
//
// Onboarding "resume deep link" behavior. When AuthedShellContent
// kicks a new user from /events/<id> (after EventLandingScreen
// auto-joined them) to /onboarding, it stashes the original path in
// location.state.from. OnboardingScreen reads that and navigates back
// there after submit — instead of the default '/' which forced the
// user to manually find the event again (the rough edge from the
// 2026-05-25 smoke that the auto-join fix exposed).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useProfile: vi.fn(),
  navigate: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../../auth/useAuth', () => ({ useAuth: mocks.useAuth }));
vi.mock('../../auth/useProfile', () => ({ useProfile: mocks.useProfile }));
vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: mocks.rpc },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

import { I18nProvider } from '../../i18n';
import { OnboardingScreen } from '../OnboardingScreen';

const profile = {
  id: 'u1',
  display_name: 'Test User',
  handle: null,
  avatar_url: null,
  onboarded_at: null,
  disabled_at: null,
  share_token: null,
  created_at: '2026-05-25T00:00:00Z',
  updated_at: '2026-05-25T00:00:00Z',
};

function renderWithState(state: { from?: string } | undefined) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[{ pathname: '/onboarding', state }]}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingScreen />} />
        </Routes>
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
  mocks.useProfile.mockReturnValue({
    query: { status: 'ready', profile },
    refresh: vi.fn().mockResolvedValue(undefined),
  });
  mocks.rpc.mockReset();
  mocks.navigate.mockReset();
});

describe('OnboardingScreen — resume deep-link after submit', () => {
  it('with state.from = /events/abc → submit navigates to /events/abc', async () => {
    mocks.rpc.mockResolvedValueOnce({ error: null });
    renderWithState({ from: '/events/abc123' });

    fireEvent.submit(screen.getByRole('button', { name: /continue|продолжить/i }).closest('form')!);

    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith('complete_onboarding', expect.any(Object));
    });
    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith('/events/abc123', { replace: true });
    });
  });

  it('with no state → submit navigates to / (default)', async () => {
    mocks.rpc.mockResolvedValueOnce({ error: null });
    renderWithState(undefined);

    fireEvent.submit(screen.getByRole('button', { name: /continue|продолжить/i }).closest('form')!);

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('with cross-origin state.from → falls back to / (open-redirect guard)', async () => {
    mocks.rpc.mockResolvedValueOnce({ error: null });
    renderWithState({ from: 'https://evil.com/phish' });

    fireEvent.submit(screen.getByRole('button', { name: /continue|продолжить/i }).closest('form')!);

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('with protocol-relative state.from → falls back to / (open-redirect guard)', async () => {
    mocks.rpc.mockResolvedValueOnce({ error: null });
    renderWithState({ from: '//evil.com/phish' });

    fireEvent.submit(screen.getByRole('button', { name: /continue|продолжить/i }).closest('form')!);

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });
});

// Note: the parent's "already-onboarded → Navigate to resumeTo" path
// shares the exact same resumeTo computation as the form's submit
// path (computed once at the top of OnboardingScreen and passed via
// prop). The form-submit tests above cover the resumeTo logic; we
// don't add separate tests for the declarative <Navigate> path
// because <Navigate> uses react-router's internal useNavigate
// dispatch (not our mocked export), so we'd have to assert on
// rendered routes instead — extra ceremony for a code path that's
// guaranteed-correct by construction (same variable, same guard).
