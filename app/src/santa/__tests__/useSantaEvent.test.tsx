// app/src/santa/__tests__/useSantaEvent.test.tsx
//
// Tests for useSantaEvent — load happy path, runDraw (success + failure),
// and reveal. Follows the vi.hoisted + makeChain pattern from T9.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Build the mock inline inside vi.hoisted so it runs before any import.
const mocks = vi.hoisted(() => {
  // Helper that builds a fresh chain where every chainable method returns
  // the chain itself. `then` starts as undefined so the chain is NOT a
  // thenable by default; set it to make the chain awaitable.
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
import { useSantaEvent } from '../useSantaEvent';
import { useAuth } from '../../auth/useAuth';
import type { User } from '@supabase/supabase-js';
import type { SantaEvent } from '../useSantaEvent';

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

/**
 * Build a minimal SantaEvent row. Status defaults to 'open' (no draw yet).
 */
function makeSantaEventRow(overrides?: Partial<SantaEvent>): SantaEvent {
  return {
    id: 'ev-santa-1',
    group_id: 'grp-1',
    name: 'Крысиный Санта 2026',
    budget_text: '500 RUB',
    gift_date: '2026-12-31',
    draw_deadline: null,
    status: 'collecting',
    created_by: 'user-organiser',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Stubs the five supabase.from() calls that loadEvent makes:
 *
 *   1. from('santa_events') → maybeSingle → eventRow
 *
 * Then Promise.all([4 parallel queries]):
 *   2. from('santa_participants') → returns<RawParticipant[]>() (thenable chain)
 *   3. from('santa_exclusions')   → returns<RawExclusion[]>()  (thenable chain)
 *   4. from('santa_assignments') [my assign] → maybeSingle → null (no assignment)
 *   5. When status !== 'revealed': resolves to Promise.resolve({data:[], error:null})
 *      — the hook uses a conditional so no 5th from() call is made.
 *      When status === 'revealed': from('santa_assignments') [all] → returns<RawAssignment[]>
 */
function stubEventLoad(
  eventRow: SantaEvent,
  opts: { myAssignment?: { giver_id: string; receiver_id: string; receiver: object } | null } = {},
): void {
  // 1. santa_events — maybeSingle
  const eventsChain = mocks.makeChain();
  (eventsChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    data: eventRow,
    error: null,
  });

  // 2. santa_participants — thenable via .returns()
  const participantsChain = mocks.makeChain();
  participantsChain.then = (
    resolve: (v: { data: unknown[]; error: null }) => void,
  ) => {
    resolve({ data: [], error: null });
    return Promise.resolve();
  };

  // 3. santa_exclusions — thenable via .returns()
  const exclusionsChain = mocks.makeChain();
  exclusionsChain.then = (
    resolve: (v: { data: unknown[]; error: null }) => void,
  ) => {
    resolve({ data: [], error: null });
    return Promise.resolve();
  };

  // 4. santa_assignments (my assignment) — maybeSingle
  const myAssignChain = mocks.makeChain();
  (myAssignChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    data: opts.myAssignment ?? null,
    error: null,
  });

  // 5. santa_assignments (all, only if revealed) — thenable via .returns()
  //    Only queue this chain when status === 'revealed'.
  if (eventRow.status === 'revealed') {
    const allAssignChain = mocks.makeChain();
    allAssignChain.then = (
      resolve: (v: { data: unknown[]; error: null }) => void,
    ) => {
      resolve({ data: [], error: null });
      return Promise.resolve();
    };
    mocks.supabase.from
      .mockReturnValueOnce(eventsChain)        // 1 santa_events
      .mockReturnValueOnce(participantsChain)  // 2
      .mockReturnValueOnce(exclusionsChain)    // 3
      .mockReturnValueOnce(myAssignChain)      // 4
      .mockReturnValueOnce(allAssignChain);    // 5
  } else {
    mocks.supabase.from
      .mockReturnValueOnce(eventsChain)        // 1 santa_events
      .mockReturnValueOnce(participantsChain)  // 2
      .mockReturnValueOnce(exclusionsChain)    // 3
      .mockReturnValueOnce(myAssignChain);     // 4 (5th is Promise.resolve in hook)
  }
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
  mocks.supabase.rpc.mockResolvedValue({ data: null, error: null });
  mocks.supabase.functions.invoke.mockResolvedValue({ data: null, error: null });
});

// ─────────────────────────── tests ───────────────────────────

describe('useSantaEvent', () => {
  it('loads participants + (if revealed) assignments — happy path', async () => {
    const eventRow = makeSantaEventRow({ status: 'collecting' });
    stubAuthUser('user-organiser');
    stubEventLoad(eventRow);

    const { result } = renderHook(() => useSantaEvent('ev-santa-1'));

    await waitFor(() => {
      expect(result.current.query.status).toBe('ready');
    });

    if (result.current.query.status === 'ready') {
      expect(result.current.query.data.event.id).toBe('ev-santa-1');
      expect(result.current.query.data.event.name).toBe('Крысиный Санта 2026');
      expect(result.current.query.data.participants).toEqual([]);
      expect(result.current.query.data.exclusions).toEqual([]);
      expect(result.current.query.data.myAssignment).toBeNull();
      expect(result.current.query.data.allAssignments).toEqual([]);
    }
  });

  it('runDraw calls rpc(run_santa_draw) and fires send-santa-draw functions.invoke', async () => {
    const eventRow = makeSantaEventRow({ status: 'collecting' });
    stubAuthUser('user-organiser');

    // Initial load — queues 4 from() calls
    stubEventLoad(eventRow);

    const { result } = renderHook(() => useSantaEvent('ev-santa-1'));

    await waitFor(() => {
      expect(result.current.query.status).toBe('ready');
    });

    // After runDraw succeeds, the hook calls reload() which triggers
    // another loadEvent sequence. Provide chains for that reload too.
    stubEventLoad(makeSantaEventRow({ status: 'drawn' }));

    let drawResult: { ok: true } | { error: string } | undefined;
    await act(async () => {
      drawResult = await result.current.runDraw();
    });

    // Flush microtasks so the fire-and-forget functions.invoke promise resolves.
    await act(async () => {
      await Promise.resolve();
    });

    expect(drawResult).toEqual({ ok: true });
    expect(mocks.supabase.rpc).toHaveBeenCalledWith('run_santa_draw', {
      _event_id: 'ev-santa-1',
    });
    expect(mocks.supabase.functions.invoke).toHaveBeenCalledWith(
      'send-santa-draw',
      { body: { event_id: 'ev-santa-1' } },
    );
  });

  it('runDraw returns error if rpc fails and does NOT call functions.invoke', async () => {
    const eventRow = makeSantaEventRow({ status: 'collecting' });
    stubAuthUser('user-organiser');

    // Initial load
    stubEventLoad(eventRow);

    const { result } = renderHook(() => useSantaEvent('ev-santa-1'));

    await waitFor(() => {
      expect(result.current.query.status).toBe('ready');
    });

    // Make the rpc fail
    mocks.supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'too_few_participants' },
    });

    let drawResult: { ok: true } | { error: string } | undefined;
    await act(async () => {
      drawResult = await result.current.runDraw();
    });

    // Flush microtasks
    await act(async () => {
      await Promise.resolve();
    });

    expect(drawResult).toEqual({ error: expect.any(String) });
    // The email invoke must NOT have been called after an rpc failure.
    expect(mocks.supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('reveal calls rpc(reveal_santa_event) with the correct event id', async () => {
    const eventRow = makeSantaEventRow({ status: 'drawn' });
    stubAuthUser('user-organiser');

    // Initial load
    stubEventLoad(eventRow);

    const { result } = renderHook(() => useSantaEvent('ev-santa-1'));

    await waitFor(() => {
      expect(result.current.query.status).toBe('ready');
    });

    // After reveal succeeds the hook calls reload(). Provide chains.
    stubEventLoad(makeSantaEventRow({ status: 'revealed' }));

    let revealResult: { ok: true } | { error: string } | undefined;
    await act(async () => {
      revealResult = await result.current.reveal();
    });

    expect(revealResult).toEqual({ ok: true });
    expect(mocks.supabase.rpc).toHaveBeenCalledWith('reveal_santa_event', {
      _event_id: 'ev-santa-1',
    });
  });
});
