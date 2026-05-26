import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n';
import { HeroCuratedItem } from '../HeroCuratedItem';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'ru');
});

function mkEntry(overrides: { id?: string; cover_url?: string | null; note?: string | null } = {}) {
  return {
    item_id: overrides.id ?? 'item-1',
    item: {
      id: overrides.id ?? 'item-1',
      title: 'Книга Sapiens',
      maker: 'Юваль Харари',
      price_text: '1500₽',
      note: overrides.note ?? null,
      cover_url: overrides.cover_url ?? null,
      priority: 1,
      owner_id: 'honoree',
    },
    claims: [],
  };
}

function renderHero(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <I18nProvider>{node}</I18nProvider>
    </MemoryRouter>,
  );
}

describe('<HeroCuratedItem>', () => {
  it('renders title, maker, and price', () => {
    renderHero(
      <HeroCuratedItem
        entry={mkEntry()}
        isHonoree
        myUserId={null}
        onDetach={vi.fn()}
        onClaim={vi.fn()}
        onRelease={vi.fn()}
      />,
    );
    expect(screen.getByText('Книга Sapiens')).toBeTruthy();
    expect(screen.getByText('Юваль Харари')).toBeTruthy();
    expect(screen.getByText('1500₽')).toBeTruthy();
  });

  it('renders the full note untruncated', () => {
    const longNote =
      'À chaque virage, sur tous les terrains. D’un bout à l’autre de la montagne. Le ski qui ouvre tous les itinéraires.';
    renderHero(
      <HeroCuratedItem
        entry={mkEntry({ note: longNote })}
        isHonoree
        myUserId={null}
        onDetach={vi.fn()}
        onClaim={vi.fn()}
        onRelease={vi.fn()}
      />,
    );
    // Full text present — no clamp truncation in hero.
    expect(screen.getByText(longNote)).toBeTruthy();
  });

  it('renders rat placeholder when item has no cover_url', () => {
    renderHero(
      <HeroCuratedItem
        entry={mkEntry({ cover_url: null })}
        isHonoree
        myUserId={null}
        onDetach={vi.fn()}
        onClaim={vi.fn()}
        onRelease={vi.fn()}
      />,
    );
    expect(screen.getByTestId('sitting-rat')).toBeTruthy();
    expect(screen.getByText('без фото')).toBeTruthy();
  });

  it('exposes detach button only for honoree', () => {
    renderHero(
      <HeroCuratedItem
        entry={mkEntry()}
        isHonoree
        myUserId={null}
        onDetach={vi.fn()}
        onClaim={vi.fn()}
        onRelease={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Книга Sapiens/)).toBeTruthy();
  });

  it('hides detach button for guest', () => {
    renderHero(
      <HeroCuratedItem
        entry={mkEntry()}
        isHonoree={false}
        myUserId="guest-1"
        onDetach={vi.fn()}
        onClaim={vi.fn()}
        onRelease={vi.fn()}
      />,
    );
    // The remove button has an aria-label that includes the item title.
    // ClaimControl ALSO references the title indirectly via "забрал/а" but
    // not in the aria-label. The simplest assertion is "no button labeled
    // with «убрать» / «remove»" — which doesn't appear in any other UI.
    const allButtons = screen.queryAllByRole('button');
    const removeButton = allButtons.find(
      (b) => b.getAttribute('aria-label')?.includes('Книга Sapiens'),
    );
    expect(removeButton).toBeUndefined();
  });
});
