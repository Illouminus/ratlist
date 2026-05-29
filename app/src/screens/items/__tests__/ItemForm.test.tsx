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

// supabase isn't exercised in these paths, but PhotoField + CategoryInput
// (rendered inside ItemForm) resolve the import at module load time.
// CategoryInput issues a `from('items').select(...).eq(...).not(...).then(...)`
// chain on mount; the stub returns an empty list so the popover never opens.
vi.mock('../../../lib/supabase', () => {
  const itemsQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    then: (resolve: (v: { data: never[] }) => void) => Promise.resolve({ data: [] }).then(resolve),
  };
  return {
    supabase: {
      from: vi.fn().mockReturnValue(itemsQuery),
      storage: {
        from: vi.fn().mockReturnValue({ upload: vi.fn(), getPublicUrl: vi.fn() }),
      },
      functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    },
  };
});

vi.mock('../../../lib/plausible', () => ({ track: vi.fn() }));

// ── imports (after mock registrations) ───────────────────────────────────────

import { I18nProvider } from '../../../i18n';
import { ItemForm } from '../ItemForm';
import type { MyItem } from '../../../items/useMyItems';
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

const DEFAULT_SUBMIT = vi.fn().mockResolvedValue({ item: {} as MyItem });

function renderForm(props: Partial<Parameters<typeof ItemForm>[0]> = {}): ReturnType<typeof render> {
  return render(
    <I18nProvider>
      <ItemForm onSubmit={DEFAULT_SUBMIT} {...props} />
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

  it('does NOT auto-fill the note field even when fetch returns a description', async () => {
    // Friend feedback 2026-05-26: the auto-filled meta description squats in
    // the note field, discouraging people from writing their own personal
    // comments. Verify the form ignores `data.description` from now on.
    mocks.fetchUrlMeta.mockResolvedValue({
      kind: 'ok',
      data: {
        title: 'A Mug',
        site_name: 'Pottery Co.',
        image_url: null,
        description: 'A hand-thrown ceramic mug with a satin glaze finish.',
      },
    });

    renderForm();
    await typeUrlAndFetch('https://example.com/mug');

    // The textarea uses t('add.notePh') = 'color, size, where you saw it…'.
    // Wait for fetch to complete (title gets filled) before asserting the
    // note stayed empty.
    await waitFor(() => {
      const titleInput = screen.getByPlaceholderText('e.g. falcon enamel mug');
      expect((titleInput as HTMLInputElement).value).toBe('A Mug');
    });
    const noteTa = screen.getByPlaceholderText('color, size, where you saw it…');
    expect((noteTa as HTMLTextAreaElement).value).toBe('');

    // The meta-fetch feedback should NOT list "note" among filled fields.
    // (Title and maker are still auto-filled — the feedback line reads
    // "filled: title, maker" or similar.)
    const feedback = await screen.findByText(/filled:/i);
    expect(feedback.textContent).not.toMatch(/note/i);
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

// ── visibility + category (friend-graph PR 2) ─────────────────────────────────

describe('ItemForm — visibility and category', () => {
  it('defaults visibility to "shared" on a fresh add form', async () => {
    renderForm();

    // VisibilitySelector renders two radio segments. The active one is
    // the only one with aria-checked="true". On create mode the default
    // is "shared" — the DB default, mirrored by the form explicitly.
    const sharedRadio = await screen.findByRole('radio', { name: /shared/i });
    expect(sharedRadio.getAttribute('aria-checked')).toBe('true');

    const privateRadio = screen.getByRole('radio', { name: /just me/i });
    expect(privateRadio.getAttribute('aria-checked')).toBe('false');

    // CategoryInput fires a background fetch on mount that calls
    // setState after the test body returns — give it a tick to settle
    // so React's act-warning doesn't fire post-test.
    await waitFor(() => {
      expect(screen.getByPlaceholderText('kitchen, books, home stuff…')).toBeTruthy();
    });
  });

  it('submits visibility and category in the payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ item: {} as MyItem });
    renderForm({ onSubmit });

    // Required title — without it submit short-circuits at the
    // titleRequired guard.
    const titleInput = screen.getByPlaceholderText('e.g. falcon enamel mug');
    fireEvent.change(titleInput, { target: { value: 'A Kitchen Thing' } });

    // Type a category. The input commits on blur or Enter — we Enter.
    // t('categories.inputPlaceholder') = 'kitchen, books, home stuff…'.
    const categoryInput = screen.getByPlaceholderText('kitchen, books, home stuff…');
    fireEvent.change(categoryInput, { target: { value: 'Кухня' } });
    fireEvent.keyDown(categoryInput, { key: 'Enter' });

    // Switch visibility to "just me" (private) — a non-default choice,
    // so this proves the selector value flows into the payload.
    const privateRadio = screen.getByRole('radio', { name: /just me/i });
    fireEvent.click(privateRadio);

    // Submit.
    const submitBtn = screen.getByRole('button', { name: /save to list/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'A Kitchen Thing',
          visibility: 'private',
          category: 'Кухня',
        }),
      );
    });
  });

  it('preserves the existing visibility + category when editing', async () => {
    const initial: MyItem = {
      id: 'item-1',
      owner_id: 'u1',
      title: 'Old Mug',
      maker: null,
      url: null,
      price_text: null,
      occasion: 'anytime',
      note: null,
      priority: 2,
      status: 'active',
      cover_url: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      visibility: 'private',
      category: 'Books',
      group_ids: [],
      event_ids: [],
    } as unknown as MyItem;

    const onSubmit = vi.fn().mockResolvedValue({ item: {} as MyItem });
    renderForm({ initial, onSubmit });

    // The private radio should be the one checked in edit mode.
    const privateRadio = screen.getByRole('radio', { name: /just me/i });
    expect(privateRadio.getAttribute('aria-checked')).toBe('true');

    // Submit without changes — the payload should mirror the loaded row.
    const submitBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: 'private',
          category: 'Books',
        }),
      );
    });
  });
});
