// app/src/screens/items/__tests__/ItemForm.test.tsx
//
// Tests for the fetchUrlMeta integration paths inside <ItemForm>.
// vi.hoisted ensures mock factories run before any import, matching the
// T8-T10 pattern used throughout this test suite.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── hoisted mock instances ────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  fetchUrlMeta: vi.fn(),
  uploadItemImage: vi.fn(),
  useAuth: vi.fn(),
  useEvents: vi.fn(),
}));

vi.mock('../../../items/fetchUrlMeta', () => ({
  fetchUrlMeta: mocks.fetchUrlMeta,
}));

vi.mock('../../../items/uploadItemImage', () => ({
  uploadItemImage: mocks.uploadItemImage,
}));

vi.mock('../../../auth/useAuth', () => ({
  useAuth: mocks.useAuth,
}));

vi.mock('../../../events/useEvents', () => ({
  useEvents: mocks.useEvents,
}));

// supabase isn't exercised in these paths, but PhotoField (rendered inside
// ItemForm) resolves the import at module load time.
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnValue({ upload: vi.fn(), getPublicUrl: vi.fn() }),
    },
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  },
}));

vi.mock('../../../lib/plausible', () => ({ track: vi.fn() }));

// ── imports (after mock registrations) ───────────────────────────────────────

import { I18nProvider } from '../../../i18n';
import { ItemForm } from '../ItemForm';
import type { MyItem } from '../../../items/useMyItems';
import type { MyGroup } from '../../../groups/useGroups';
import type { User } from '@supabase/supabase-js';

// ── helpers ───────────────────────────────────────────────────────────────────

function stubAuth(userId = 'u1'): void {
  mocks.useAuth.mockReturnValue({
    status: 'authenticated',
    user: { id: userId } as User,
    session: null,
    signInWithMagicLink: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  });
}

function stubEvents(): void {
  mocks.useEvents.mockReturnValue({
    query: { status: 'ready', events: [], error: null },
    refresh: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
  });
}

const NO_GROUPS: MyGroup[] = [];
const DEFAULT_SUBMIT = vi.fn().mockResolvedValue({ item: {} as MyItem });

function renderForm(props: Partial<Parameters<typeof ItemForm>[0]> = {}): ReturnType<typeof render> {
  return render(
    <I18nProvider>
      <ItemForm
        groups={NO_GROUPS}
        onSubmit={DEFAULT_SUBMIT}
        {...props}
      />
    </I18nProvider>,
  );
}

// Helper: type a URL into the URL field and click the fetch button.
// Field uses a plain <div> for labels (not <label>), so inputs have no
// accessible name from the label. We find them by placeholder text instead.
async function typeUrlAndFetch(url: string): Promise<void> {
  // t('add.urlPh') = 'https://… (optional)'
  const urlInput = screen.getByPlaceholderText('https://… (optional)');
  fireEvent.change(urlInput, { target: { value: url } });

  // The fetch button shows t('add.fetchMeta') = 'fetch from link'
  const fetchBtn = screen.getByRole('button', { name: /fetch from link/i });
  fireEvent.click(fetchBtn);

  // Let the async handler resolve
  await waitFor(() => {
    expect(mocks.fetchUrlMeta).toHaveBeenCalledWith(url);
  });
}

// ── setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  stubAuth();
  stubEvents();
});

// ── test cases ────────────────────────────────────────────────────────────────

describe('ItemForm — fetchUrlMeta integration', () => {
  it('fills empty fields after a successful fetch', async () => {
    mocks.fetchUrlMeta.mockResolvedValue({
      kind: 'ok',
      data: {
        title: 'Awesome Mug',
        site_name: 'Pottery Co.',
        image_url: 'https://example.com/mug.jpg',
      },
    });

    renderForm();

    await typeUrlAndFetch('https://example.com/mug');

    // title field should be filled. t('add.thingPh') = 'e.g. falcon enamel mug'
    await waitFor(() => {
      const titleInput = screen.getByPlaceholderText('e.g. falcon enamel mug');
      expect((titleInput as HTMLInputElement).value).toBe('Awesome Mug');
    });

    // maker field — t('add.makerPh') = 'brand or shop'
    const makerInput = screen.getByPlaceholderText('brand or shop');
    expect((makerInput as HTMLInputElement).value).toBe('Pottery Co.');
  });

  it('does not overwrite user-typed title when meta fetch returns a different title', async () => {
    mocks.fetchUrlMeta.mockResolvedValue({
      kind: 'ok',
      data: {
        title: 'Fetched Title From Page',
        site_name: 'Some Shop',
        image_url: null,
      },
    });

    renderForm();

    // User pre-types a title before fetching. t('add.thingPh') = 'e.g. falcon enamel mug'
    const titleInput = screen.getByPlaceholderText('e.g. falcon enamel mug');
    fireEvent.change(titleInput, { target: { value: 'My Own Title' } });

    await typeUrlAndFetch('https://example.com/product');

    // Title should still be the user's own value
    await waitFor(() => {
      expect((titleInput as HTMLInputElement).value).toBe('My Own Title');
    });
  });

  it('shows metaBlocked feedback for blocked_host error', async () => {
    mocks.fetchUrlMeta.mockResolvedValue({
      kind: 'error',
      code: 'blocked_host',
    });

    renderForm();

    await typeUrlAndFetch('https://nsfw-site.example.com/item');

    // t('add.metaBlocked') = "we don't fetch previews from that site…"
    await waitFor(() => {
      expect(
        screen.getByText(/we don't fetch previews from that site/i),
      ).toBeTruthy();
    });
  });

  it('shows metaUrlNotAllowed feedback for private_address error', async () => {
    mocks.fetchUrlMeta.mockResolvedValue({
      kind: 'error',
      code: 'private_address',
    });

    renderForm();

    await typeUrlAndFetch('http://192.168.1.1/item');

    // t('add.metaUrlNotAllowed') = "couldn't fetch — looks like an internal address…"
    await waitFor(() => {
      expect(
        screen.getByText(/looks like an internal address/i),
      ).toBeTruthy();
    });
  });

  it('shows metaFetchError feedback for generic/unknown error codes', async () => {
    mocks.fetchUrlMeta.mockResolvedValue({
      kind: 'error',
      code: 'fetch_failed',
    });

    renderForm();

    await typeUrlAndFetch('https://example.com/broken');

    // t('add.metaFetchError') = "couldn't fetch from that link"
    await waitFor(() => {
      expect(
        screen.getByText(/couldn't fetch from that link/i),
      ).toBeTruthy();
    });
  });
});
