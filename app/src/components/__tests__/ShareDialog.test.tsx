import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useShareToken: vi.fn(),
  useToast: vi.fn(),
  toastShow: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('../../items/useShareToken', () => ({
  useShareToken: mocks.useShareToken,
  notifyShareTokenChanged: vi.fn(),
}));
vi.mock('../useToast', () => ({ useToast: mocks.useToast }));
vi.mock('../../lib/plausible', () => ({ track: vi.fn() }));
vi.mock('../../lib/useFocusTrap', () => ({ useFocusTrap: vi.fn() }));

import { I18nProvider } from '../../i18n';
import { ShareDialog } from '../ShareDialog';

function renderDialog() {
  const onClose = vi.fn();
  render(
    <I18nProvider>
      <ShareDialog open onClose={onClose} />
    </I18nProvider>,
  );
  return onClose;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'ru');
  mocks.useShareToken.mockReturnValue({
    query: { status: 'ready', token: 'tok123', error: null },
    enable: vi.fn(),
    disable: vi.fn(),
    rotate: vi.fn(),
  });
  mocks.toastShow.mockReset();
  mocks.useToast.mockReturnValue({ show: mocks.toastShow });
  mocks.writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mocks.writeText },
    configurable: true,
  });
});

describe('<ShareDialog>', () => {
  it('closes the dialog after copying the share link', async () => {
    const onClose = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /скопировать|copy/i }));
    expect(mocks.writeText).toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('has an explicit close (×) button that closes the dialog', () => {
    const onClose = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /закрыть|close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
