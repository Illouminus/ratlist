import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { PrioritySectionHeader } from '../PrioritySectionHeader';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'ru');
});

function renderWithI18n(ui: React.ReactNode) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe('<PrioritySectionHeader>', () => {
  it('renders the «Очень хочу» label and count for level 1', () => {
    renderWithI18n(<PrioritySectionHeader level={1} count={3} />);
    expect(screen.getByText('Очень хочу')).toBeTruthy();
    expect(screen.getByText('— 3')).toBeTruthy();
  });

  it('renders the «Хочу» label for level 2', () => {
    renderWithI18n(<PrioritySectionHeader level={2} count={0} />);
    expect(screen.getByText('Хочу')).toBeTruthy();
    expect(screen.getByText('— 0')).toBeTruthy();
  });

  it('renders the «Если найдётся» label for level 3', () => {
    renderWithI18n(<PrioritySectionHeader level={3} count={1} />);
    expect(screen.getByText('Если найдётся')).toBeTruthy();
  });
});
