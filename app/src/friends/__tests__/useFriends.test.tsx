// app/src/friends/__tests__/useFriends.test.tsx
//
// `useFriends` exposes the caller's symmetric friendship list via
// `get_friends`, plus a `unfriend` action and a realtime channel that
// re-fetches when `friendships` rows change anywhere (server-side RLS
// scopes the events to the caller's own edges).
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    rpc: vi.fn(),
    channel: vi.fn().mockReturnValue(channel),
    removeChannel: vi.fn(),
    _channel: channel,
  };
});

vi.mock('../../lib/supabase', () => ({ supabase: mockSupabase }));

import { useFriends } from '../useFriends';

const channel = mockSupabase._channel;

const FRIEND_ROW = {
  id: 'friend-1',
  display_name: 'Аня',
  handle: 'anya',
  avatar_url: null,
  updated_at: '2026-05-20T10:00:00Z',
};

const FRIEND_ROW_2 = {
  id: 'friend-2',
  display_name: 'Боря',
  handle: 'borya',
  avatar_url: null,
  updated_at: '2026-05-21T10:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  mockSupabase.channel.mockReturnValue(channel);
});

describe('useFriends', () => {
  it('returns loading then loaded with the friends list', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: [FRIEND_ROW], error: null });

    const { result } = renderHook(() => useFriends());

    expect(result.current.state.kind).toBe('loading');

    await waitFor(() => expect(result.current.state.kind).toBe('loaded'));

    expect(mockSupabase.rpc).toHaveBeenCalledWith('get_friends');
    if (result.current.state.kind === 'loaded') {
      expect(result.current.state.friends).toHaveLength(1);
      expect(result.current.state.friends[0]!.id).toBe('friend-1');
    }
  });

  it('unfriend calls supabase.rpc("unfriend", { _other }) and refreshes', async () => {
    // Initial load: two friends.
    mockSupabase.rpc.mockResolvedValueOnce({ data: [FRIEND_ROW, FRIEND_ROW_2], error: null });

    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.state.kind).toBe('loaded'));

    // After unfriend: only one friend remains (re-fetch returns [FRIEND_ROW]).
    mockSupabase.rpc.mockResolvedValueOnce({ data: undefined, error: null }); // unfriend RPC
    mockSupabase.rpc.mockResolvedValueOnce({ data: [FRIEND_ROW], error: null }); // refresh

    let outcome: Awaited<ReturnType<typeof result.current.unfriend>> | undefined;
    await act(async () => {
      outcome = await result.current.unfriend('friend-2');
    });

    expect(outcome).toEqual({ ok: true });
    expect(mockSupabase.rpc).toHaveBeenCalledWith('unfriend', { _other: 'friend-2' });

    await waitFor(() => {
      if (result.current.state.kind !== 'loaded') return;
      expect(result.current.state.friends).toHaveLength(1);
    });

    if (result.current.state.kind === 'loaded') {
      expect(result.current.state.friends[0]!.id).toBe('friend-1');
    }
  });

  it('realtime INSERT on friendships re-fetches and surfaces the new friend', async () => {
    // Initial load: one friend.
    mockSupabase.rpc.mockResolvedValueOnce({ data: [FRIEND_ROW], error: null });

    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.state.kind).toBe('loaded'));

    // Realtime callback should trigger a refresh that returns both.
    mockSupabase.rpc.mockResolvedValueOnce({ data: [FRIEND_ROW, FRIEND_ROW_2], error: null });

    // Find the postgres_changes handler the hook registered.
    const onCalls = channel.on.mock.calls as unknown[][];
    const handler = onCalls.find((c) => c[0] === 'postgres_changes')?.[2] as
      | ((payload: unknown) => void)
      | undefined;
    expect(handler).toBeDefined();

    vi.useFakeTimers();
    act(() => {
      handler!({ eventType: 'INSERT', new: { user_a: 'me', user_b: 'friend-2' } });
    });
    // Debounce window is 300 ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    vi.useRealTimers();

    await waitFor(() => {
      if (result.current.state.kind !== 'loaded') return;
      expect(result.current.state.friends).toHaveLength(2);
    });
  });
});
