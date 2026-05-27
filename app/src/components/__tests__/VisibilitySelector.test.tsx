// `<VisibilitySelector>` — 3-segment private/friends/public toggle.
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

function renderSelector(value: 'private' | 'friends' | 'public', onChange = vi.fn()) {
  render(
    <I18nProvider>
      <VisibilitySelector value={value} onChange={onChange} />
    </I18nProvider>,
  );
  return { onChange };
}

describe('<VisibilitySelector>', () => {
  it('renders all three segments with their labels', () => {
    renderSelector('private');

    expect(screen.getByRole('radio', { name: /just me/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /friends/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /anyone with the link/i })).toBeTruthy();
  });

  it('marks the active segment with aria-checked=true and helper text matches', () => {
    renderSelector('friends');

    const friendsBtn = screen.getByRole('radio', { name: /friends/i });
    const privateBtn = screen.getByRole('radio', { name: /just me/i });
    expect(friendsBtn.getAttribute('aria-checked')).toBe('true');
    expect(privateBtn.getAttribute('aria-checked')).toBe('false');

    expect(screen.getByText(/your rats see this in your list/i)).toBeTruthy();
  });

  it('shows the privateHelp text when value=private', () => {
    renderSelector('private');
    expect(screen.getByText(/only you see this/i)).toBeTruthy();
  });

  it('shows the publicHelp text when value=public', () => {
    renderSelector('public');
    expect(screen.getByText(/shows up on your public page/i)).toBeTruthy();
  });

  it('clicking each segment calls onChange with the matching value', () => {
    const { onChange } = renderSelector('private');

    fireEvent.click(screen.getByRole('radio', { name: /friends/i }));
    expect(onChange).toHaveBeenCalledWith('friends');

    fireEvent.click(screen.getByRole('radio', { name: /anyone with the link/i }));
    expect(onChange).toHaveBeenCalledWith('public');

    fireEvent.click(screen.getByRole('radio', { name: /just me/i }));
    expect(onChange).toHaveBeenCalledWith('private');

    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
