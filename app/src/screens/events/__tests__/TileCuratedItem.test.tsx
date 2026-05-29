import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n';
import { TileCuratedItem } from '../TileCuratedItem';
import type { EventClaim } from '../../../events/useEvent';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'ru');
});

function mkEntry(
  overrides: {
    id?: string;
    cover_url?: string | null;
    title?: string;
    note?: string | null;
    maker?: string | null;
    price_text?: string | null;
    priority?: 1 | 2 | 3;
    claims?: EventClaim[];
  } = {},
) {
  return {
    item_id: overrides.id ?? 'item-1',
    item: {
      id: overrides.id ?? 'item-1',
      title: overrides.title ?? 'Кружка',
      maker: overrides.maker ?? null,
      price_text: overrides.price_text === undefined ? '600₽' : overrides.price_text,
      note: overrides.note ?? null,
      cover_url: overrides.cover_url ?? null,
      priority: overrides.priority ?? 2,
    },
    claims: overrides.claims ?? [],
  };
}

function mkClaim(userId: string, displayName: string): EventClaim {
  return {
    id: `claim-${userId}`,
    item_id: 'item-1',
    user_id: userId,
    user: { id: userId, display_name: displayName, handle: null, avatar_url: null },
  };
}

interface RenderProps {
  entry?: ReturnType<typeof mkEntry>;
  isHonoree?: boolean;
  myUserId?: string | null;
  onDetach?: () => void;
  onClaim?: () => void;
  onRelease?: () => void;
}

function renderTile(props: RenderProps = {}) {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <TileCuratedItem
          entry={props.entry ?? mkEntry()}
          isHonoree={props.isHonoree ?? false}
          myUserId={props.myUserId ?? null}
          onDetach={props.onDetach ?? vi.fn()}
          onClaim={props.onClaim ?? vi.fn()}
          onRelease={props.onRelease ?? vi.fn()}
        />
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe('<TileCuratedItem>', () => {
  it('renders title and price', () => {
    renderTile({ isHonoree: true });
    expect(screen.getByText('Кружка')).toBeTruthy();
    expect(screen.getByText('600₽')).toBeTruthy();
  });

  it('renders item.note inline under the price', () => {
    renderTile({ entry: mkEntry({ note: 'Прикольная штучка' }), isHonoree: true });
    expect(screen.getByText('Прикольная штучка')).toBeTruthy();
  });

  it('renders rat placeholder when no cover_url', () => {
    renderTile({ entry: mkEntry({ cover_url: null }), isHonoree: true });
    expect(screen.getByTestId('sitting-rat')).toBeTruthy();
  });

  it('shows detach button only for honoree', () => {
    renderTile({ isHonoree: true });
    expect(screen.getByLabelText(/Кружка/)).toBeTruthy();
  });

  it('hides detach button for guest', () => {
    renderTile({ isHonoree: false });
    expect(screen.queryByLabelText(/Кружка/)).toBeNull();
  });

  // ── claim control (restored after PR #31) ──────────────────────────────
  it('guest with no claim sees the claim button, and clicking it claims', () => {
    const onClaim = vi.fn();
    renderTile({ isHonoree: false, onClaim });
    const btn = screen.getByRole('button', { name: /я возьму/i });
    fireEvent.click(btn);
    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  it('honoree does NOT see a claim button (can’t claim own item)', () => {
    renderTile({ isHonoree: true });
    expect(screen.queryByRole('button', { name: /я возьму|i'll get it/i })).toBeNull();
  });

  it('when I claimed it, shows my-claim marker + a release that calls onRelease', () => {
    const onRelease = vi.fn();
    renderTile({
      entry: mkEntry({ claims: [mkClaim('me', 'Я')] }),
      isHonoree: false,
      myUserId: 'me',
      onRelease,
    });
    expect(screen.getByText(/ты берёшь/i)).toBeTruthy();
    // No claim button while it's mine.
    expect(screen.queryByRole('button', { name: /я возьму/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /отпустить/i }));
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('when someone else claimed it, shows their name and no claim button', () => {
    renderTile({
      entry: mkEntry({ claims: [mkClaim('other', 'Аня')] }),
      isHonoree: false,
      myUserId: 'me',
    });
    expect(screen.getByText(/Аня берёт/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /я возьму/i })).toBeNull();
  });

  it('renders priority dot for «очень хочу» (priority 1)', () => {
    renderTile({ entry: mkEntry({ priority: 1 }), isHonoree: true });
    expect(screen.getByTestId('priority-dots')).toBeTruthy();
  });

  it('renders priority dot for «если найдётся» (priority 3)', () => {
    renderTile({ entry: mkEntry({ priority: 3 }), isHonoree: true });
    expect(screen.getByTestId('priority-dots')).toBeTruthy();
  });

  it('renders priority dot for default priority 2 («хочу»)', () => {
    // Friend feedback (2026-05-27): the «хочу» level used to be
    // suppressed; now every item carries an explicit dot row so the
    // signal isn't ambiguous.
    renderTile({ entry: mkEntry({ priority: 2 }), isHonoree: true });
    expect(screen.getByTestId('priority-dots')).toBeTruthy();
  });
});
