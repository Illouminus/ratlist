/**
 * ActivationChecklist — behaviour tests.
 *
 * Done-detection comes from three sources: the `hasItems` prop, the
 * share token (useShareToken), and the friend count (useFriends). Both
 * hooks are mocked via mutable refs so each test pins the exact state it
 * needs before render.
 *
 * Covers:
 *  1. Renders the three steps + a "0/3" progress counter.
 *  2. A done step is struck through and drops its action; an undone step
 *     keeps its action and fires the right callback on click.
 *  3. Dismiss is hidden until the user has an item; once shown, clicking
 *     it persists the graduated flag and calls onDismiss.
 *  4. When all three are done the checklist graduates: renders nothing
 *     and persists the localStorage flag.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { ActivationChecklist } from '../ActivationChecklist';
import { isActivationDone } from '../../lib/activation';

// ─── mutable hook state ──────────────────────────────────────────────
const shareState: { current: { status: string; token: string | null; error: null } } = {
  current: { status: 'ready', token: null, error: null },
};
const friendsState: { current: { kind: string; friends: unknown[] } } = {
  current: { kind: 'loaded', friends: [] },
};

vi.mock('../../items/useShareToken', () => ({
  useShareToken: () => ({
    query: shareState.current,
    enable: vi.fn(),
    disable: vi.fn(),
    rotate: vi.fn(),
  }),
}));

vi.mock('../../friends/useFriends', () => ({
  useFriends: () => ({
    state: friendsState.current,
    refresh: vi.fn(),
    unfriend: vi.fn(),
  }),
}));

const mockTrack = vi.hoisted(() => vi.fn());
vi.mock('../../lib/plausible', () => ({ track: mockTrack }));

// ─── helpers ─────────────────────────────────────────────────────────
const USER_ID = 'user-1';

function renderChecklist(props: Partial<React.ComponentProps<typeof ActivationChecklist>> = {}) {
  const onAdd = vi.fn();
  const onShare = vi.fn();
  const onAddRat = vi.fn();
  const onDismiss = vi.fn();
  render(
    <I18nProvider>
      <ActivationChecklist
        userId={USER_ID}
        hasItems={false}
        onAdd={onAdd}
        onShare={onShare}
        onAddRat={onAddRat}
        onDismiss={onDismiss}
        {...props}
      />
    </I18nProvider>,
  );
  return { onAdd, onShare, onAddRat, onDismiss };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'ru');
  shareState.current = { status: 'ready', token: null, error: null };
  friendsState.current = { kind: 'loaded', friends: [] };
  mockTrack.mockClear();
});

describe('<ActivationChecklist>', () => {
  it('renders the three steps with a 0/3 counter when nothing is done', () => {
    renderChecklist({ hasItems: false });
    expect(screen.getByText('добавь первую вещь')).toBeTruthy();
    expect(screen.getByText('включи ссылку на список')).toBeTruthy();
    expect(screen.getByText('позови крысу')).toBeTruthy();
    expect(screen.getByText('0/3')).toBeTruthy();
  });

  it('the first step fires onAdd when no item exists yet', () => {
    const { onAdd } = renderChecklist({ hasItems: false });
    // Step 1 is undone → its "добавить →" action is present.
    fireEvent.click(screen.getByRole('button', { name: /добавить/ }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('strikes a done step, drops its action, and routes undone actions', () => {
    // Item added (step 1 done), still no share / no rat.
    const { onShare, onAddRat } = renderChecklist({ hasItems: true });

    expect(screen.getByText('1/3')).toBeTruthy();
    // Step 1 done → its label is struck through, no "добавить" action.
    expect(
      (screen.getByText('добавь первую вещь') as HTMLElement).style.textDecoration,
    ).toBe('line-through');
    expect(screen.queryByRole('button', { name: /добавить/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /включить/ }));
    expect(onShare).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /позвать/ }));
    expect(onAddRat).toHaveBeenCalledTimes(1);
  });

  it('hides dismiss until the user has an item, then persists + calls onDismiss', () => {
    // No item → no "скрыть".
    renderChecklist({ hasItems: false });
    expect(screen.queryByRole('button', { name: 'скрыть' })).toBeNull();
  });

  it('dismiss persists the graduated flag and calls onDismiss once an item exists', () => {
    const { onDismiss } = renderChecklist({ hasItems: true });
    const hide = screen.getByRole('button', { name: 'скрыть' });
    fireEvent.click(hide);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(isActivationDone(USER_ID)).toBe(true);
  });

  it('graduates (renders nothing + persists flag) when all three are done', () => {
    shareState.current = { status: 'ready', token: 'tok123', error: null };
    friendsState.current = { kind: 'loaded', friends: [{ id: 'f1' }] };
    renderChecklist({ hasItems: true });

    expect(screen.queryByText('с чего начать')).toBeNull();
    expect(isActivationDone(USER_ID)).toBe(true);
    expect(mockTrack).toHaveBeenCalledWith('ActivationCompleted');
  });
});
