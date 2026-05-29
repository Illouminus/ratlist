// `<VisibilitySelector>` — 2-segment shared/private toggle.
//
// Pins the contract: each segment renders with its label, clicking any
// segment calls onChange with the right value, and the helper text below
// matches the active segment.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { VisibilitySelector } from '../VisibilitySelector';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'en');
});

function renderSelector(value: 'private' | 'shared', onChange = vi.fn()) {
  render(
    <I18nProvider>
      <VisibilitySelector value={value} onChange={onChange} />
    </I18nProvider>,
  );
  return { onChange };
}

describe('<VisibilitySelector>', () => {
  it('renders both segments with their labels', () => {
    renderSelector('shared');

    expect(screen.getByRole('radio', { name: /shared/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /just me/i })).toBeTruthy();
  });

  it('marks the active segment with aria-checked=true and helper text matches', () => {
    renderSelector('shared');

    const sharedBtn = screen.getByRole('radio', { name: /shared/i });
    const privateBtn = screen.getByRole('radio', { name: /just me/i });
    expect(sharedBtn.getAttribute('aria-checked')).toBe('true');
    expect(privateBtn.getAttribute('aria-checked')).toBe('false');

    expect(screen.getByText(/anyone you give your list link to/i)).toBeTruthy();
  });

  it('shows the privateHelp text when value=private', () => {
    renderSelector('private');
    expect(screen.getByText(/only you see this/i)).toBeTruthy();
  });

  it('clicking each segment calls onChange with the matching value', () => {
    const { onChange } = renderSelector('private');

    fireEvent.click(screen.getByRole('radio', { name: /shared/i }));
    expect(onChange).toHaveBeenCalledWith('shared');

    fireEvent.click(screen.getByRole('radio', { name: /just me/i }));
    expect(onChange).toHaveBeenCalledWith('private');

    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
