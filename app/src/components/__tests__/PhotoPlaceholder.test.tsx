import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { PhotoPlaceholder } from '../PhotoPlaceholder';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'ru');
});

function renderWithI18n(ui: React.ReactNode) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe('<PhotoPlaceholder>', () => {
  it('renders without rat by default', () => {
    renderWithI18n(<PhotoPlaceholder aspectRatio="1 / 1" />);
    expect(screen.queryByTestId('sitting-rat')).toBeNull();
  });

  it('renders SittingRat when withRat=true', () => {
    renderWithI18n(<PhotoPlaceholder aspectRatio="1 / 1" withRat />);
    expect(screen.getByTestId('sitting-rat')).toBeTruthy();
  });

  it('uses t("placeholder.noPhoto") as default sign text', () => {
    renderWithI18n(<PhotoPlaceholder aspectRatio="1 / 1" withRat />);
    expect(screen.getByText('без фото')).toBeTruthy();
  });

  it('uses explicit signText when provided', () => {
    renderWithI18n(<PhotoPlaceholder aspectRatio="1 / 1" withRat signText="hello" />);
    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.queryByText('без фото')).toBeNull();
  });
});
