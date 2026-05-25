// app/src/events/__tests__/useEvent.test.tsx
//
// vi.mock factories are hoisted before imports, so we use vi.hoisted to
// create the shared mock instance that the factory and test body both
// need. The factory must be self-contained (no imported helpers).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Build the mock inline inside vi.hoisted so it runs before any import.
const mocks = vi.hoisted(() => {
  // Helper that builds a fresh chain object where every chainable method
  // returns the chain itself. The `then` slot starts as undefined so the
  // chain is NOT a thenable by default; set it to make the chain
  // awaitable as a resolved value.
  function makeChain() {
    const chain: Record<string, unknown> = {
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
    ]) {
      (chain[k] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
    return chain;
  }

  // The default chain used when no per-call override is set.
  const defaultChain = makeChain();

  return {
    makeChain,
    defaultChain,
    supabase: {
      from: vi.fn().mockReturnValue(defaultChain),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      channel: vi.fn(),
      removeChannel: vi.fn(),
      functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    },
  };
});

vi.mock('../../lib/supabase', () => ({ supabase: mocks.supabase }));
vi.mock('../../auth/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../lib/plausible', () => ({ track: vi.fn() }));

// Now safe to import the modules under test
import { useEvent } from '../useEvent';
import { useAuth } from '../../auth/useAuth';
import type { User } from '@supabase/supabase-js';
import type { Event } from '../../lib/db';

// ─────────────────────────── helpers ───────────────────────────

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

function stubAuthAnonymous(): void {
  vi.mocked(useAuth).mockReturnValue({
    status: 'anonymous',
    user: null,
    session: null,
    signInWithMagicLink: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  });
}

/**
 * Stubs two supabase.from() calls in sequence (link-first model, no
 * event_circles fetch):
 *   1. from('events') → maybeSingle resolves with `eventRow`
 *   2. from('event_items') → chain.then resolves with empty items []
 *
 * Because items is empty, the claims query is short-circuited in the
 * hook (`if (itemIds.length === 0) …`) so no 3rd call occurs.
 */
function stubEventLoad(eventRow: Event): void {
  // Reset mockReturnValueOnce queue (vi.clearAllMocks() doesn't fully
  // clear it; a leftover from a prior test can shift the order).
  mocks.supabase.from.mockReset();
  mocks.supabase.from.mockReturnValue(mocks.defaultChain);

  // Chain for the events table — maybeSingle returns the row.
  const eventsChain = mocks.makeChain();
  (eventsChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    data: eventRow,
    error: null,
  });

  // Chain for event_items — awaitable via .then, returns empty array.
  const itemsChain = mocks.makeChain();
  itemsChain.then = (resolve: (v: { data: unknown[]; error: null }) => void) => {
    resolve({ data: [], error: null });
    return Promise.resolve();
  };

  // Return these chains in order for the two from() calls.
  mocks.supabase.from
    .mockReturnValueOnce(eventsChain)
    .mockReturnValueOnce(itemsChain);
}

// ─────────────────────────── setup ───────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Re-wire default chain methods after clearAllMocks.
  for (const k of [
    'select', 'eq', 'neq', 'in', 'is', 'order', 'limit',
    'update', 'insert', 'delete', 'upsert', 'returns',
  ]) {
    (mocks.defaultChain[k] as ReturnType<typeof vi.fn>).mockReturnValue(mocks.defaultChain);
  }
  mocks.defaultChain.then = undefined;
  mocks.supabase.from.mockReturnValue(mocks.defaultChain);

  stubAuthAnonymous();
});

// ─────────────────────────── tests ───────────────────────────

describe('useEvent', () => {
  it('loads the event row and exposes it in ready state', async () => {
    const eventRow: Event = {
      id: 'ev-1',
      honoree_id: 'user-honoree',
      title: 'Birthday Party',
      kind: 'birthday',
      occurs_on: '2026-12-25',
      note: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      share_token: 'mocktoken1234567',
    };

    stubAuthUser('user-honoree');
    stubEventLoad(eventRow);

    const { result } = renderHook(() => useEvent('ev-1'));

    await waitFor(() => {
      expect(result.current.query.status).toBe('ready');
    });

    if (result.current.query.status === 'ready') {
      expect(result.current.query.data.event.id).toBe('ev-1');
      expect(result.current.query.data.event.title).toBe('Birthday Party');
    }
  });

  it('isHonoree is true when caller is the honoree', async () => {
    const honoreeId = 'user-honoree';
    const eventRow: Event = {
      id: 'ev-2',
      honoree_id: honoreeId,
      title: 'My Event',
      kind: 'birthday',
      occurs_on: null,
      note: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      share_token: 'mocktoken1234567',
    };

    stubAuthUser(honoreeId);
    stubEventLoad(eventRow);

    const { result } = renderHook(() => useEvent('ev-2'));

    await waitFor(() => {
      expect(result.current.query.status).toBe('ready');
    });

    if (result.current.query.status === 'ready') {
      expect(result.current.query.data.isHonoree).toBe(true);
    }
  });

  it('isHonoree is false when caller is NOT the honoree', async () => {
    const eventRow: Event = {
      id: 'ev-3',
      honoree_id: 'user-honoree',
      title: 'Someone Else Event',
      kind: 'birthday',
      occurs_on: null,
      note: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      share_token: 'mocktoken1234567',
    };

    stubAuthUser('user-guest');
    stubEventLoad(eventRow);

    const { result } = renderHook(() => useEvent('ev-3'));

    await waitFor(() => {
      expect(result.current.query.status).toBe('ready');
    });

    if (result.current.query.status === 'ready') {
      expect(result.current.query.data.isHonoree).toBe(false);
    }
  });
});
