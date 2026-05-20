/**
 * Tests for KycLightModal.
 *
 * Mocks:
 *   - useAuth: returns a dummy user
 *   - useProfile: returns a pre-filled profile so pre-fill logic is testable
 *   - supabase.functions.invoke: controllable per-test
 *
 * Follows project test patterns: I18nProvider wrapper, @testing-library/react.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../../i18n';
import { KycLightModal } from '../KycLightModal';

// ── Module mocks ────────────────────────────────────────────────────────────

// useAuth → always returns an authenticated dummy user
vi.mock('../../../auth/useAuth', () => ({
  useAuth: () => ({
    status: 'authenticated',
    user: { id: 'test-user-id', email: 'test@example.com' },
    session: null,
    signInWithMagicLink: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  }),
}));

// useProfile → returns a ready profile with a display_name so pre-fill works
vi.mock('../../../auth/useProfile', () => ({
  useProfile: () => ({
    query: {
      status: 'ready',
      profile: {
        id: 'test-user-id',
        display_name: 'Sophie Bernard',
        handle: null,
        avatar_url: null,
        created_at: '2024-01-01T00:00:00Z',
        disabled_at: null,
      },
      error: null,
    },
    refresh: vi.fn(),
  }),
}));

// supabase.functions.invoke — we spy on it per-test
const mockInvoke = vi.fn();
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function renderModal(props: {
  open?: boolean;
  onClose?: () => void;
  onSuccess?: (id: string) => void;
}) {
  const onClose = props.onClose ?? vi.fn();
  const onSuccess = props.onSuccess ?? vi.fn();
  return render(
    <I18nProvider>
      <KycLightModal open={props.open ?? true} onClose={onClose} onSuccess={onSuccess} />
    </I18nProvider>,
  );
}

/** Fill all required fields so the form is valid for submission. */
function fillAllFields() {
  // firstName / lastName are pre-filled from profile mock — set them anyway to be safe
  fireEvent.change(screen.getByDisplayValue('Sophie'), { target: { value: 'Sophie' } });
  fireEvent.change(screen.getByDisplayValue('Bernard'), { target: { value: 'Bernard' } });

  // birthday — only date input on the page
  const bday = document.querySelector('input[type="date"]') as HTMLInputElement;
  fireEvent.change(bday, { target: { value: '1990-06-15' } });

  // IBAN by placeholder
  fireEvent.change(screen.getByPlaceholderText(/FR76/i), {
    target: { value: 'FR76 3000 6000 0112 3456 7890 189' },
  });

  // address / city / postal via autocomplete attribute (unique per field)
  const byAutocomplete = (token: string) =>
    document.querySelector(`input[autocomplete="${token}"]`) as HTMLInputElement | null;

  const address = byAutocomplete('street-address');
  const city = byAutocomplete('address-level2');
  const postal = byAutocomplete('postal-code');

  if (address) fireEvent.change(address, { target: { value: '12 rue de la Paix' } });
  if (city) fireEvent.change(city, { target: { value: 'Paris' } });
  if (postal) fireEvent.change(postal, { target: { value: '75001' } });
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockInvoke.mockReset();
});

describe('KycLightModal', () => {
  it('renders when open=true', () => {
    renderModal({ open: true });
    expect(screen.getByText(/a few details/i)).toBeInTheDocument();
  });

  it('renders null when open=false', () => {
    const { container } = renderModal({ open: false });
    expect(container.firstChild).toBeNull();
  });

  it('blocks submit when required fields are empty', async () => {
    const onSuccess = vi.fn();
    renderModal({ onSuccess });

    // birthday and IBAN are never pre-filled so the form is definitively
    // invalid (validate() returns false). Click confirm — the request
    // must not be sent and onSuccess must not be called.
    fireEvent.click(screen.getByRole('button', { name: /confirm and continue/i }));

    // microtask flush for any state updates triggered by the click
    await waitFor(() => {
      expect(mockInvoke).not.toHaveBeenCalled();
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('calls Edge Function on valid submit and invokes onSuccess with mangopay_user_id', async () => {
    mockInvoke.mockResolvedValue({
      data: { mangopay_user_id: 'mp-test-1', already_exists: false },
      error: null,
    });

    const onSuccess = vi.fn();
    renderModal({ onSuccess });

    fillAllFields();

    fireEvent.click(screen.getByRole('button', { name: /confirm and continue/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('mp-test-1');
    });

    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockInvoke).toHaveBeenCalledWith(
      'mangopay-kyc-light',
      expect.objectContaining({
        body: expect.objectContaining({
          firstName: 'Sophie',
          lastName: 'Bernard',
        }),
      }),
    );
  });
});
