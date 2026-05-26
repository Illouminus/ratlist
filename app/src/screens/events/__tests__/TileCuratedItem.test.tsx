import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n';
import { TileCuratedItem } from '../TileCuratedItem';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'ru');
});

function mkEntry(overrides: { id?: string; cover_url?: string | null; title?: string } = {}) {
  return {
    item_id: overrides.id ?? 'item-1',
    item: {
      id: overrides.id ?? 'item-1',
      title: overrides.title ?? 'Кружка',
      price_text: '600₽',
      cover_url: overrides.cover_url ?? null,
      priority: 2,
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
    renderTile(
      <TileCuratedItem
        entry={mkEntry()}
        isHonoree
        myUserId={null}
        onDetach={vi.fn()}
      />,
    );
    expect(screen.getByText('Кружка')).toBeTruthy();
    expect(screen.getByText('600₽')).toBeTruthy();
  });

  it('renders rat placeholder when no cover_url', () => {
    renderTile(
      <TileCuratedItem
        entry={mkEntry({ cover_url: null })}
        isHonoree
        myUserId={null}
        onDetach={vi.fn()}
      />,
    );
    expect(screen.getByTestId('sitting-rat')).toBeTruthy();
  });

  it('shows detach button only for honoree', () => {
    renderTile(
      <TileCuratedItem
        entry={mkEntry()}
        isHonoree
        myUserId={null}
        onDetach={vi.fn()}
      />,
    );
    // aria-label includes the item title via events.removeItem template
    expect(screen.getByLabelText(/Кружка/)).toBeTruthy();
  });

  it('hides detach button for guest', () => {
    renderTile(
      <TileCuratedItem
        entry={mkEntry()}
        isHonoree={false}
        myUserId="guest-1"
        onDetach={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/Кружка/)).toBeNull();
  });

  it('does NOT render ClaimControl on the tile — even for guests', () => {
    renderTile(
      <TileCuratedItem
        entry={mkEntry()}
        isHonoree={false}
        myUserId="guest-1"
        onDetach={vi.fn()}
      />,
    );
    // ClaimControl renders «забрать» (RU) when no claim exists.
    expect(screen.queryByRole('button', { name: /забрать|claim/i })).toBeNull();
  });
});
