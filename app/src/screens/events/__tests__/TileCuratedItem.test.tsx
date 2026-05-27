import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n';
import { TileCuratedItem } from '../TileCuratedItem';

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
  };
}

function renderTile(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <I18nProvider>{node}</I18nProvider>
    </MemoryRouter>,
  );
}

describe('<TileCuratedItem>', () => {
  it('renders title and price', () => {
    renderTile(<TileCuratedItem entry={mkEntry()} isHonoree onDetach={vi.fn()} />);
    expect(screen.getByText('Кружка')).toBeTruthy();
    expect(screen.getByText('600₽')).toBeTruthy();
  });

  it('renders item.note inline under the price', () => {
    renderTile(
      <TileCuratedItem
        entry={mkEntry({ note: 'Прикольная штучка' })}
        isHonoree
        onDetach={vi.fn()}
      />,
    );
    expect(screen.getByText('Прикольная штучка')).toBeTruthy();
  });

  it('renders rat placeholder when no cover_url', () => {
    renderTile(
      <TileCuratedItem
        entry={mkEntry({ cover_url: null })}
        isHonoree
        onDetach={vi.fn()}
      />,
    );
    expect(screen.getByTestId('sitting-rat')).toBeTruthy();
  });

  it('shows detach button only for honoree', () => {
    renderTile(<TileCuratedItem entry={mkEntry()} isHonoree onDetach={vi.fn()} />);
    expect(screen.getByLabelText(/Кружка/)).toBeTruthy();
  });

  it('hides detach button for guest', () => {
    renderTile(
      <TileCuratedItem entry={mkEntry()} isHonoree={false} onDetach={vi.fn()} />,
    );
    expect(screen.queryByLabelText(/Кружка/)).toBeNull();
  });

  it('does NOT render an inline claim button — even for guests (click-through to /i/:id)', () => {
    renderTile(
      <TileCuratedItem entry={mkEntry()} isHonoree={false} onDetach={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /забрать|claim/i })).toBeNull();
  });

  it('renders priority dot for «очень хочу» (priority 1)', () => {
    renderTile(
      <TileCuratedItem
        entry={mkEntry({ priority: 1 })}
        isHonoree
        onDetach={vi.fn()}
      />,
    );
    expect(screen.getByTestId('priority-dots')).toBeTruthy();
  });

  it('renders priority dot for «если найдётся» (priority 3)', () => {
    renderTile(
      <TileCuratedItem
        entry={mkEntry({ priority: 3 })}
        isHonoree
        onDetach={vi.fn()}
      />,
    );
    expect(screen.getByTestId('priority-dots')).toBeTruthy();
  });

  it('hides priority dot for default priority 2 («хочу»)', () => {
    renderTile(
      <TileCuratedItem
        entry={mkEntry({ priority: 2 })}
        isHonoree
        onDetach={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('priority-dots')).toBeNull();
  });
});
