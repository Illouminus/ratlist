import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../i18n';
import { Wordmark } from '../Wordmark';

function renderWordmark(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <I18nProvider>{node}</I18nProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('<Wordmark>', () => {
  it('renders the Russian app name by default', () => {
    localStorage.setItem('kryska.lang', 'ru');
    renderWordmark(<Wordmark />);
    expect(screen.getByText('Крысиные желания')).toBeTruthy();
  });

  it('renders the English app name when lang is en', () => {
    localStorage.setItem('kryska.lang', 'en');
    renderWordmark(<Wordmark />);
    expect(screen.getByText('Rat List')).toBeTruthy();
  });

  it('links home with the app name as its accessible name', () => {
    localStorage.setItem('kryska.lang', 'ru');
    renderWordmark(<Wordmark />);
    // The link wraps non-text nodes (styled name span + decorative dot/year),
    // so the aria-label is its only accessible name.
    const link = screen.getByRole('link', { name: 'Крысиные желания' });
    expect(link.getAttribute('href')).toBe('/');
  });

  it('renders a plain inline lockup (no link) when link={false}', () => {
    localStorage.setItem('kryska.lang', 'ru');
    renderWordmark(<Wordmark link={false} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Крысиные желания')).toBeTruthy();
  });

  it('shows the year marginalia by default and hides it when year={false}', () => {
    localStorage.setItem('kryska.lang', 'ru');
    const withYear = renderWordmark(<Wordmark />);
    expect(withYear.container.querySelector('.wordmark-year')).toBeTruthy();
    withYear.unmount();

    const without = renderWordmark(<Wordmark year={false} />);
    expect(without.container.querySelector('.wordmark-year')).toBeNull();
  });
});
