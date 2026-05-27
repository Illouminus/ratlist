// `<CategoryInput>` — text input + autocomplete dropdown over the owner's
// existing categories.
//
// Pins the contract: empty text commits null (not ''), typing a prefix
// matches existing categories case-insensitively, picking a suggestion
// applies the full name, and committing a brand new free-text value on
// blur still updates the parent.
//
// The component does its async category fetch on mount and uses a small
// blur-debounce timer (so a click on a suggestion has time to land before
// the popover closes). Tests avoid fake timers — they instead rely on
// `findBy*` to wait for the async result, and assert the eventual
// onChange call via `waitFor`.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../../auth/useAuth', () => ({ useAuth: mocks.useAuth }));
vi.mock('../../lib/supabase', () => ({
  supabase: { from: mocks.from },
}));

import { I18nProvider } from '../../i18n';
import { CategoryInput } from '../CategoryInput';

function setupCategoryQuery(categories: Array<string | null>) {
  const rows = categories.map((c) => ({ category: c }));
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  mocks.from.mockReturnValue(chain);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'en');
  mocks.useAuth.mockReset();
  mocks.from.mockReset();
  mocks.useAuth.mockReturnValue({
    user: { id: 'u1' },
    status: 'authenticated',
    session: null,
    signInWithMagicLink: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  });
});

function renderInput(value: string | null, onChange = vi.fn()) {
  render(
    <I18nProvider>
      <CategoryInput value={value} onChange={onChange} />
    </I18nProvider>,
  );
  return { onChange };
}

describe('<CategoryInput>', () => {
  it('renders empty input when value is null', async () => {
    setupCategoryQuery([]);
    renderInput(null);
    // Drain the post-mount async category fetch before asserting.
    await act(async () => {
      await Promise.resolve();
    });
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('');
  });

  it('shows the existing value when non-null', async () => {
    setupCategoryQuery([]);
    renderInput('Books');
    await act(async () => {
      await Promise.resolve();
    });
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe('Books');
  });

  it('typing a prefix surfaces matching existing categories, click → applies', async () => {
    setupCategoryQuery(['Кухня', 'Книги', 'Дом', null]);
    const { onChange } = renderInput(null);

    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Кух' } });

    const suggestion = await screen.findByRole('option', { name: 'Кухня' });
    const button = suggestion.querySelector('button') as HTMLButtonElement;

    // mousedown is what the component listens for (so blur doesn't kill
    // the popover before the click lands).
    fireEvent.mouseDown(button);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('Кухня');
    });
  });

  it('clearing the input and blurring commits null, not ""', async () => {
    setupCategoryQuery([]);
    const { onChange } = renderInput('Books');

    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  it('typing a brand-new category + blur commits the new free-text value', async () => {
    setupCategoryQuery(['Kitchen']);
    const { onChange } = renderInput(null);

    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Garden' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('Garden');
    });
  });

  it('case-insensitive prefix match — typed lowercase still matches CamelCase', async () => {
    setupCategoryQuery(['Kitchen', 'Books']);
    renderInput(null);

    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'kit' } });

    const option = await screen.findByRole('option', { name: 'Kitchen' });
    expect(option).toBeTruthy();
  });
});
