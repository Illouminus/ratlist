// app/src/__tests__/PostAuthRedirect.test.tsx
//
// PostAuthRedirect is the safety net for the case where Supabase's
// OAuth flow lands the user on `/` (Site URL fallback) instead of
// `/auth/callback` — confirmed in prod 2026-05-25 with the Maria
// smoke. Lives inside the router so it can call useNavigate.
//
// The test exercises the transition `loading → authenticated` and
// asserts the navigate fires from any landing path (not just
// /auth/callback) when sessionStorage holds a stashed next path.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../auth/useAuth', () => ({ useAuth: mocks.useAuth }));
vi.mock('../auth/useProfile', () => ({
  useProfile: () => ({ query: { status: 'anonymous' } }),
}));
// Avoid pulling in the full deps tree from AppRoutes' eager imports
// for screens we don't exercise. The component under test is just
// PostAuthRedirect; we render it inside a minimal router.
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    rpc: vi.fn(),
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));
vi.mock('../lib/plausible', () => ({ track: vi.fn(), initPlausible: vi.fn() }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

// Import PostAuthRedirect by exporting it from Router.tsx — done in
// the implementation so this test can hold it directly. (If you ever
// inline it back into AppRoutes, expose it through a named export so
// this test keeps compiling.)
import { PostAuthRedirect } from '../Router';

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
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<PostAuthRedirect />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  mocks.useAuth.mockReset();
  mocks.navigate.mockReset();
});

describe('PostAuthRedirect — Site URL fallback safety net', () => {
  it('authenticated + stored next + on / → navigates to stored next', async () => {
    sessionStorage.setItem('auth_next_path', '/event/abc123');
    stubAuth('authenticated');
    renderAt('/');
    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith('/event/abc123', { replace: true });
    });
  });

  it('authenticated + no stored next → does not navigate', async () => {
    stubAuth('authenticated');
    renderAt('/');
    // Wait a tick to let any pending effects fire
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('authenticated + stored next === current location → does not navigate (already there)', async () => {
    sessionStorage.setItem('auth_next_path', '/event/abc123');
    stubAuth('authenticated');
    renderAt('/event/abc123');
    await new Promise((r) => setTimeout(r, 50));
    // AuthCallbackScreen would have already routed here; PostAuthRedirect
    // sees same pathname and stays out of the way.
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('loading status → does not navigate yet, storage NOT consumed', async () => {
    sessionStorage.setItem('auth_next_path', '/event/abc123');
    stubAuth('loading');
    renderAt('/');
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.navigate).not.toHaveBeenCalled();
    // Storage still holds the value for when status flips later
    expect(sessionStorage.getItem('auth_next_path')).toBe('/event/abc123');
  });

  it('anonymous → does not navigate, storage NOT consumed (will retry on next sign-in)', async () => {
    sessionStorage.setItem('auth_next_path', '/event/abc123');
    stubAuth('anonymous');
    renderAt('/');
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('auth_next_path')).toBe('/event/abc123');
  });

  it('cross-origin stored next → consumed but no navigate (open-redirect guard)', async () => {
    sessionStorage.setItem('auth_next_path', 'https://evil.com/phish');
    stubAuth('authenticated');
    renderAt('/');
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.navigate).not.toHaveBeenCalled();
    // Unsafe value gets cleared on consume
    expect(sessionStorage.getItem('auth_next_path')).toBeNull();
  });
});
