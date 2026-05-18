import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { SkipLink } from '../SkipLink';

beforeEach(() => {
  localStorage.clear();
});

describe('SkipLink', () => {
  it('renders an anchor pointing to #main with the skip-link class', () => {
    render(
      <I18nProvider>
        <SkipLink />
      </I18nProvider>,
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('#main');
    expect(link.classList.contains('skip-link')).toBe(true);
  });

  it('uses English copy by default', () => {
    render(
      <I18nProvider>
        <SkipLink />
      </I18nProvider>,
    );
    expect(screen.getByRole('link').textContent).toBe('Skip to main content');
  });

  it('uses Russian copy when localStorage seeds the RU locale', () => {
    localStorage.setItem('kryska.lang', 'ru');
    render(
      <I18nProvider>
        <SkipLink />
      </I18nProvider>,
    );
    expect(screen.getByRole('link').textContent).toBe('Перейти к содержимому');
  });
});
