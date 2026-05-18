// app/src/events/__tests__/useEvents.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const mockSupabase = vi.hoisted(() => {
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);

  return {
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    from: vi.fn(),
    channel: vi.fn().mockReturnValue(channel),
    removeChannel: vi.fn(),
    _channel: channel,
  };
});

vi.mock('../../lib/supabase', () => ({ supabase: mockSupabase }));
vi.mock('../../auth/useAuth', () => ({ useAuth: vi.fn() }));

import { useEvents } from '../useEvents';
import { useAuth } from '../../auth/useAuth';
import type { User } from '@supabase/supabase-js';

const channel = mockSupabase._channel;

function stubAuthUser(userId: string): void {
  vi.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    user: { id: userId } as User,
    session: null,
    signInWithMagicLink: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  mockSupabase.channel.mockReturnValue(channel);
  mockSupabase.rpc.mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Pull every postgres_changes handler the hook registered. */
function postgresChangesHandlers(): Array<(payload: unknown) => void> {
  return (channel.on.mock.calls as unknown[][])
    .filter((c) => c[0] === 'postgres_changes')
    .map((c) => c[2] as (payload: unknown) => void);
}

describe('useEvents realtime debounce', () => {
  it('collapses a burst of postgres_changes events into one RPC call', async () => {
    stubAuthUser('user-1');

    const { result } = renderHook(() => useEvents());

    await waitFor(() => {
      expect(result.current.query.status).toBe('ready');
    });
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);

    const handlers = postgresChangesHandlers();
    expect(handlers).toHaveLength(3); // events + event_circles + event_items

    vi.useFakeTimers();

    // Fire one handler from each table in quick succession.
    handlers[0]!({});
    handlers[1]!({});
    handlers[2]!({});

    // 299 ms in — debounce still pending, no extra RPC.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);

    // One more ms — the trailing call fires exactly once.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(2);
  });

  it('cancels the pending debounce on unmount', async () => {
    stubAuthUser('user-1');

    const { result, unmount } = renderHook(() => useEvents());

    await waitFor(() => {
      expect(result.current.query.status).toBe('ready');
    });
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);

    const handlers = postgresChangesHandlers();
    expect(handlers.length).toBeGreaterThan(0);

    vi.useFakeTimers();
    handlers[0]!({});
    unmount();

    // Even after the debounce window, no extra RPC because cancel() ran
    // in the effect cleanup.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(channel);
  });
});
