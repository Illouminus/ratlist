// app/src/items/__tests__/useMyItems.test.tsx
//
// vi.mock factories are hoisted before imports, so we use vi.hoisted to
// create the shared mock instance that the factory and test body both
// need. The factory must be self-contained (no imported helpers).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Build the mock inline inside vi.hoisted so it runs before any import.
const mockSupabase = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn> | unknown> = {
    select: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    upsert: vi.fn(),
    returns: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: undefined as unknown,
  };
  for (const k of [
    'select', 'eq', 'neq', 'in', 'is', 'order', 'limit',
    'update', 'insert', 'delete', 'upsert', 'returns',
  ] as const) {
    (chain[k] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  }

  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);

  return {
    from: vi.fn().mockReturnValue(chain),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    channel: vi.fn().mockReturnValue(channel),
    removeChannel: vi.fn(),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    _chain: chain,
    _channel: channel,
  };
});

vi.mock('../../lib/supabase', () => ({
  supabase: mockSupabase,
}));

vi.mock('../../auth/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../lib/plausible', () => ({
  track: vi.fn(),
}));

// Now safe to import the modules under test
import { useMyItems } from '../useMyItems';
import { useAuth } from '../../auth/useAuth';
import type { User } from '@supabase/supabase-js';

type ChainRecord = Record<string, ReturnType<typeof vi.fn>>;

const chain = mockSupabase._chain as ChainRecord;
const channel = mockSupabase._channel;

function stubAuthUser(userId: string): void {
  vi.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    user: { id: userId } as User,
    session: null,
    signInWithMagicLink: vi.fn<[string], Promise<string | null>>(),
    signInWithGoogle: vi.fn<[], Promise<string | null>>(),
    signOut: vi.fn<[], Promise<void>>(),
  });
}

function stubAuthAnonymous(): void {
  vi.mocked(useAuth).mockReturnValue({
    status: 'anonymous',
    user: null,
    session: null,
    signInWithMagicLink: vi.fn<[string], Promise<string | null>>(),
    signInWithGoogle: vi.fn<[], Promise<string | null>>(),
    signOut: vi.fn<[], Promise<void>>(),
  });
}

function stubItemsResponse(rows: Array<Record<string, unknown>>): void {
  (mockSupabase._chain as ChainRecord & { then: unknown }).then = (
    resolve: (v: { data: unknown; error: null }) => void,
  ) => {
    resolve({ data: rows, error: null });
    return Promise.resolve();
  };
}

function stubItemsError(err: { code?: string; message: string }): void {
  (mockSupabase._chain as ChainRecord & { then: unknown }).then = (
    resolve: (v: { data: null; error: typeof err }) => void,
  ) => {
    resolve({ data: null, error: err });
    return Promise.resolve();
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  for (const k of [
    'select', 'eq', 'neq', 'in', 'is', 'order', 'limit',
    'update', 'insert', 'delete', 'upsert', 'returns',
  ] as const) {
    chain[k]!.mockReturnValue(chain);
  }

  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  mockSupabase.from.mockReturnValue(chain);
  mockSupabase.channel.mockReturnValue(channel);

  stubAuthAnonymous();
});

describe('useMyItems', () => {
  it('loads items on mount (happy path)', async () => {
    stubAuthUser('user-1');
    stubItemsResponse([
      {
        id: 'i1',
        owner_id: 'user-1',
        title: 'A',
        status: 'active',
        item_groups: [],
        event_items: [],
      },
    ]);

    const { result } = renderHook(() => useMyItems());

    await waitFor(() => {
      expect(result.current.query.status).toBe('ready');
    });
    if (result.current.query.status === 'ready') {
      expect(result.current.query.items).toHaveLength(1);
      expect(result.current.query.items[0]?.title).toBe('A');
    }
  });

  it('surfaces Postgrest error', async () => {
    stubAuthUser('user-1');
    stubItemsError({ code: '42501', message: 'permission denied' });

    const { result } = renderHook(() => useMyItems());

    await waitFor(() => {
      expect(result.current.query.status).toBe('error');
    });
    if (result.current.query.status === 'error') {
      expect(result.current.query.error).toBe('permission denied');
    }
  });

  it('subscribes to realtime on mount and cleans up on unmount', async () => {
    stubAuthUser('user-1');
    stubItemsResponse([]);

    const { unmount } = renderHook(() => useMyItems());

    await waitFor(() => {
      expect(mockSupabase.channel).toHaveBeenCalled();
      expect(channel.subscribe).toHaveBeenCalled();
    });

    unmount();
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(channel);
  });

  it('re-fetches when realtime emits a change', async () => {
    stubAuthUser('user-1');
    stubItemsResponse([]);

    renderHook(() => useMyItems());

    await waitFor(() => expect(channel.subscribe).toHaveBeenCalled());

    const fromCallsBefore = mockSupabase.from.mock.calls.length;

    // Find the first postgres_changes callback from .on(...) invocations
    const onCalls = channel.on.mock.calls as unknown[][];
    const handler = onCalls.find((c) => c[0] === 'postgres_changes')?.[2] as
      | ((payload: Record<string, unknown>) => void)
      | undefined;
    expect(handler).toBeDefined();

    await act(async () => {
      handler!({ eventType: 'INSERT', new: { id: 'i2' } });
      await new Promise<void>((r) => setTimeout(r, 0));
    });

    expect(mockSupabase.from.mock.calls.length).toBeGreaterThan(fromCallsBefore);
  });
});
