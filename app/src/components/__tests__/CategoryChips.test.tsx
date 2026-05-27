// `<CategoryChips>` — horizontal "all · cat (n) · ..." filter row.
//
// Pins the contract: distinct categories render with counts, the
// "Uncategorised" chip appears when null-category items exist, clicking
// a chip calls onChange with the right value, and the active chip is
// reflected in aria-pressed.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { CategoryChips } from '../CategoryChips';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'en');
});

function renderChips(
  items: Array<{ category: string | null }>,
  active: string | null | 'all',
  onChange = vi.fn(),
) {
  render(
    <I18nProvider>
      <CategoryChips items={items} active={active} onChange={onChange} />
    </I18nProvider>,
  );
  return { onChange };
}

describe('<CategoryChips>', () => {
  it('renders only the "all" chip when items is empty', () => {
    renderChips([], 'all');
    expect(screen.getByRole('button', { name: /^all$/i })).toBeTruthy();
    expect(screen.queryByText(/uncategorised/i)).toBeNull();
  });

  it('renders distinct categories alphabetically with counts', () => {
    renderChips(
      [
        { category: 'kitchen' },
        { category: 'books' },
        { category: 'kitchen' },
        { category: 'books' },
        { category: 'kitchen' },
      ],
      'all',
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.textContent).toBe('all');
    expect(buttons[1]?.textContent).toBe('books (2)');
    expect(buttons[2]?.textContent).toBe('kitchen (3)');
  });

  it('appends the "uncategorised" chip with count when null-category items exist', () => {
    renderChips(
      [
        { category: 'books' },
        { category: null },
        { category: null },
        { category: 'books' },
      ],
      'all',
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[1]?.textContent).toBe('books (2)');
    expect(buttons[2]?.textContent).toBe('uncategorised (2)');
  });

  it('marks the active chip with aria-pressed=true ("all" by default)', () => {
    renderChips([{ category: 'books' }], 'all');
    const allChip = screen.getByRole('button', { name: /^all$/i });
    expect(allChip.getAttribute('aria-pressed')).toBe('true');
    const booksChip = screen.getByRole('button', { name: /books/i });
    expect(booksChip.getAttribute('aria-pressed')).toBe('false');
  });

  it('marks a category chip active when active === its name', () => {
    renderChips([{ category: 'books' }, { category: 'kitchen' }], 'books');
    const booksChip = screen.getByRole('button', { name: /books/i });
    expect(booksChip.getAttribute('aria-pressed')).toBe('true');
  });

  it('marks the uncategorised chip active when active === null', () => {
    renderChips([{ category: null }, { category: 'books' }], null);
    const uncatChip = screen.getByRole('button', { name: /uncategorised/i });
    expect(uncatChip.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking chips calls onChange with the right value', () => {
    const { onChange } = renderChips(
      [{ category: 'books' }, { category: null }],
      'all',
    );

    fireEvent.click(screen.getByRole('button', { name: /books/i }));
    expect(onChange).toHaveBeenCalledWith('books');

    fireEvent.click(screen.getByRole('button', { name: /uncategorised/i }));
    expect(onChange).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByRole('button', { name: /^all$/i }));
    expect(onChange).toHaveBeenCalledWith('all');

    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
