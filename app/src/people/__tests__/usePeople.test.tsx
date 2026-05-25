// app/src/people/__tests__/usePeople.test.tsx
//
// Phase D switches the data source to get_my_people (link-first model:
// People auto-populates from co-event-participants). Tests pin the
// expected shape on the consumer side.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  supabase: {
    rpc: vi.fn(),
  },
  useAuth: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({ supabase: mocks.supabase }));
vi.mock('../../auth/useAuth', () => ({ useAuth: mocks.useAuth }));

import { usePeople } from '../usePeople';
import type { User } from '@supabase/supabase-js';

function stubAuthUser(userId = 'u1'): void {
  mocks.useAuth.mockReturnValue({
    status: 'authenticated',
    user: { id: userId } as User,
    session: null,
    signInWithMagicLink: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  });
}

beforeEach(() => {
  mocks.supabase.rpc.mockReset();
  mocks.useAuth.mockReset();
});

describe('usePeople', () => {
  it('loads from get_my_people RPC and exposes the new shape', async () => {
    stubAuthUser();
    mocks.supabase.rpc.mockResolvedValueOnce({
      data: [
        {
          user_id: 'p1',
          display_name: 'Таня',
          handle: 'tanya',
          avatar_url: null,
          has_public_list: true,
          last_interaction_at: '2026-05-20T10:00:00Z',
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => usePeople());
    await waitFor(() => expect(result.current.query.status).toBe('ready'));

    expect(mocks.supabase.rpc).toHaveBeenCalledWith('get_my_people');
    if (result.current.query.status === 'ready') {
      expect(result.current.query.people).toHaveLength(1);
      const p = result.current.query.people[0]!;
      expect(p.id).toBe('p1');
      expect(p.display_name).toBe('Таня');
      expect(p.has_public_list).toBe(true);
      expect(p.last_interaction_at).toBe('2026-05-20T10:00:00Z');
    }
  });

  it('renders empty state when get_my_people returns []', async () => {
    stubAuthUser();
    mocks.supabase.rpc.mockResolvedValueOnce({ data: [], error: null });

    const { result } = renderHook(() => usePeople());
    await waitFor(() => expect(result.current.query.status).toBe('ready'));

    if (result.current.query.status === 'ready') {
      expect(result.current.query.people).toEqual([]);
    }
  });

  it('surfaces RPC errors', async () => {
    stubAuthUser();
    mocks.supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'rpc_failed', code: 'P0001' },
    });

    const { result } = renderHook(() => usePeople());
    await waitFor(() => expect(result.current.query.status).toBe('error'));

    if (result.current.query.status === 'error') {
      expect(result.current.query.error).toBe('rpc_failed');
    }
  });
});
