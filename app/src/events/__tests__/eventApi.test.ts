// app/src/events/__tests__/eventApi.test.ts
//
// Thin wrappers around the public RPCs. Tests assert the wrapper
// translates the supabase-js shape into a plain object / throws on
// error, so the screen code stays free of error-handling boilerplate.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('../../lib/supabase', () => ({ supabase: mocks.supabase }));

import { getEventView, joinEventViaToken } from '../eventApi';

beforeEach(() => {
  mocks.supabase.rpc.mockReset();
});

describe('getEventView', () => {
  it('returns the first row of the RPC result', async () => {
    mocks.supabase.rpc.mockResolvedValueOnce({
      data: [
        {
          event_id: 'e1',
          title: 'T',
          kind: 'birthday',
          occurs_on: null,
          note: null,
          honoree_id: 'u1',
          honoree_name: 'Alice',
          honoree_avatar_url: null,
          my_status: 'anon',
          participant_count: 0,
          items: [],
        },
      ],
      error: null,
    });
    const view = await getEventView('tok');
    expect(mocks.supabase.rpc).toHaveBeenCalledWith('get_event_view', { _token: 'tok' });
    expect(view.event_id).toBe('e1');
    expect(view.my_status).toBe('anon');
  });

  it('throws the supabase error when RPC fails', async () => {
    mocks.supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'event_not_found', code: 'P0001' },
    });
    await expect(getEventView('bad')).rejects.toMatchObject({ message: 'event_not_found' });
  });

  it('throws event_not_found when RPC returns empty array', async () => {
    mocks.supabase.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(getEventView('whatever')).rejects.toThrow(/event_not_found/);
  });
});

describe('joinEventViaToken', () => {
  it('returns the event id from the RPC', async () => {
    mocks.supabase.rpc.mockResolvedValueOnce({ data: 'e1', error: null });
    const id = await joinEventViaToken('tok');
    expect(mocks.supabase.rpc).toHaveBeenCalledWith('join_event_via_token', { _token: 'tok' });
    expect(id).toBe('e1');
  });

  it('throws on error', async () => {
    mocks.supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'not_authenticated' },
    });
    await expect(joinEventViaToken('tok')).rejects.toMatchObject({ message: 'not_authenticated' });
  });
});
