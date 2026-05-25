// app/src/screens/__tests__/AuthCallbackScreen.test.tsx
//
// Regression tests for the `next=` round-trip. AuthCallbackScreen reads
// the stored path from sessionStorage (set by AuthProvider before
// signInWith* triggers the OAuth navigation). URL-based `?next=` was
// the original approach but Supabase strips query params off the
// redirect URL when the bare callback URL is what's in the allow-list —
// confirmed in prod 2026-05-25 (Maria's signup landed on / instead of
// /event/<token>). sessionStorage survives the OAuth round-trip
// reliably because it's browser-local, not URL-mediated.
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

describe('AuthCallbackScreen — next= propagation via sessionStorage', () => {
  beforeEach(() => {
    // Each test starts with an empty session store. Real prod tabs are
    // either empty (first sign-in) or have a single key set by the
    // matching signInWith* call.
    sessionStorage.clear();
  });

  it('authenticated + no stored next → navigates to /', () => {
    stubAuth('authenticated');
    renderAt('/auth/callback');
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });

  it('authenticated + safe stored next → navigates to that path', () => {
    sessionStorage.setItem('auth_next_path', '/event/abc123def456');
    stubAuth('authenticated');
    renderAt('/auth/callback');
    expect(mocks.navigate).toHaveBeenCalledWith('/event/abc123def456');
    // Single-use: storage cleared after consumption (refresh doesn't replay)
    expect(sessionStorage.getItem('auth_next_path')).toBeNull();
  });

  it('authenticated + cross-origin stored next → falls back to / (open-redirect guard)', () => {
    sessionStorage.setItem('auth_next_path', 'https://evil.com/phish');
    stubAuth('authenticated');
    renderAt('/auth/callback');
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });

  it('authenticated + protocol-relative stored next → falls back to / (open-redirect guard)', () => {
    sessionStorage.setItem('auth_next_path', '//evil.com/phish');
    stubAuth('authenticated');
    renderAt('/auth/callback');
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });

  it('anonymous + stored next → /login preserves next via URL for the retry', () => {
    sessionStorage.setItem('auth_next_path', '/event/abc');
    stubAuth('anonymous');
    renderAt('/auth/callback');
    // URL-based pass-through to LoginScreen here is fine — LoginScreen
    // re-stashes it in sessionStorage before the next signInWith* call.
    expect(mocks.navigate).toHaveBeenCalledWith('/login?next=%2Fevent%2Fabc');
  });

  it('anonymous + no stored next → /login without query', () => {
    stubAuth('anonymous');
    renderAt('/auth/callback');
    expect(mocks.navigate).toHaveBeenCalledWith('/login');
  });

  it('loading → does not navigate yet', () => {
    sessionStorage.setItem('auth_next_path', '/event/abc');
    stubAuth('loading');
    renderAt('/auth/callback');
    expect(mocks.navigate).not.toHaveBeenCalled();
    // Storage NOT consumed while loading — first render reads it via
    // useState(() => consumeNextPath()), so once status flips to
    // authenticated, the value is held in component state and storage
    // can be empty. We just check that navigate didn't fire.
  });
});
