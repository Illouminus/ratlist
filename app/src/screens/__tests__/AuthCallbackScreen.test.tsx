// app/src/screens/__tests__/AuthCallbackScreen.test.tsx
//
// Regression tests for the `next=` round-trip fix. The /event/<token>
// flow depends on AuthCallbackScreen reading ?next= after the OAuth
// redirect and navigating the user there — without this, auto-join
// never fires (the bug that took down the 2026-05-25 smoke).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  navigate: vi.fn(),
  track: vi.fn(),
  // supabase imports get stubbed too so the screen module loads in CI
  // without env vars (see EventDetailScreen.test for the same pattern).
}));

vi.mock('../../auth/useAuth', () => ({ useAuth: mocks.useAuth }));
vi.mock('../../lib/plausible', () => ({ track: mocks.track }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  // Replace <Navigate> with a spy so we can assert the target. Have to
  // mock Navigate because AuthCallbackScreen renders it instead of
  // calling useNavigate().
  return {
    ...actual,
    Navigate: ({ to }: { to: string; replace?: boolean }) => {
      mocks.navigate(to);
      return null;
    },
  };
});

import { I18nProvider } from '../../i18n';
import { AuthCallbackScreen } from '../AuthCallbackScreen';

function stubAuth(status: 'loading' | 'authenticated' | 'anonymous') {
  mocks.useAuth.mockReturnValue({
    status,
    user: status === 'authenticated' ? { id: 'u1' } : null,
    session: null,
    signInWithMagicLink: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  });
}

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <AuthCallbackScreen />
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  mocks.useAuth.mockReset();
  mocks.navigate.mockReset();
  mocks.track.mockReset();
});

describe('AuthCallbackScreen — next= propagation', () => {
  it('authenticated + no next → navigates to /', () => {
    stubAuth('authenticated');
    renderAt('/auth/callback');
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });

  it('authenticated + same-origin next → navigates to that path', () => {
    stubAuth('authenticated');
    renderAt('/auth/callback?next=%2Fevent%2Fabc123def456');
    expect(mocks.navigate).toHaveBeenCalledWith('/event/abc123def456');
  });

  it('authenticated + cross-origin next → falls back to / (open-redirect guard)', () => {
    stubAuth('authenticated');
    renderAt('/auth/callback?next=https%3A%2F%2Fevil.com%2Fphish');
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });

  it('authenticated + protocol-relative next → falls back to / (open-redirect guard)', () => {
    stubAuth('authenticated');
    renderAt('/auth/callback?next=%2F%2Fevil.com%2Fphish');
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });

  it('anonymous → navigates to /login preserving next', () => {
    stubAuth('anonymous');
    renderAt('/auth/callback?next=%2Fevent%2Fabc');
    expect(mocks.navigate).toHaveBeenCalledWith('/login?next=%2Fevent%2Fabc');
  });

  it('anonymous + no next → navigates to /login without query', () => {
    stubAuth('anonymous');
    renderAt('/auth/callback');
    expect(mocks.navigate).toHaveBeenCalledWith('/login');
  });

  it('loading → does not navigate yet', () => {
    stubAuth('loading');
    renderAt('/auth/callback?next=%2Fevent%2Fabc');
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
