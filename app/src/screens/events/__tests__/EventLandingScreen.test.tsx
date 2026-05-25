// app/src/screens/events/__tests__/EventLandingScreen.test.tsx
//
// Anon path: render event header + items grid, no claim status, sign-in
// CTA. Invalid token: friendly "not found" message. Authed paths covered
// in C.4 (auto-join + redirect).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  getEventView: vi.fn(),
  joinEventViaToken: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('../../../events/eventApi', () => ({
  getEventView: mocks.getEventView,
  joinEventViaToken: mocks.joinEventViaToken,
}));

vi.mock('../../../auth/useAuth', () => ({
  useAuth: mocks.useAuth,
}));

vi.mock('../../../lib/plausible', () => ({ track: vi.fn() }));

import { I18nProvider } from '../../../i18n';
import { EventLandingScreen } from '../EventLandingScreen';

function stubAnon(): void {
  mocks.useAuth.mockReturnValue({
    status: 'anonymous',
    user: null,
    session: null,
    signInWithMagicLink: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  });
}

function renderAt(token = 'abc123def456'): ReturnType<typeof render> {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[`/event/${token}`]}>
        <Routes>
          <Route path="/event/:token" element={<EventLandingScreen />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  mocks.getEventView.mockReset();
  mocks.joinEventViaToken.mockReset();
  mocks.useAuth.mockReset();
  // Default i18n lang is EN (loadInitialLang reads localStorage; jsdom is empty).
  localStorage.clear();
});

describe('EventLandingScreen — anon view', () => {
  beforeEach(stubAnon);

  it('renders event title + honoree + items + sign-in CTA', async () => {
    mocks.getEventView.mockResolvedValueOnce({
      event_id: 'e1',
      title: 'Olia birthday',
      kind: 'birthday',
      occurs_on: '2026-06-12',
      note: null,
      honoree_id: 'u1',
      honoree_name: 'Olia',
      honoree_avatar_url: null,
      my_status: 'anon',
      participant_count: 4,
      items: [
        {
          id: 'i1',
          title: 'Concert ticket',
          cover_url: null,
          url: null,
          price_text: '€50',
          maker: null,
          priority: 2,
          is_claimed: null,
        },
      ],
    });

    renderAt();

    await waitFor(() => {
      expect(screen.getByText('Olia birthday')).toBeInTheDocument();
    });
    expect(screen.getByText('Concert ticket')).toBeInTheDocument();
    // Sign-in CTA for anon viewer; href carries the next= back-redirect.
    const cta = screen.getByRole('link', { name: /sign in/i });
    expect(cta).toBeInTheDocument();
    expect(cta.getAttribute('href')).toContain('/login');
    expect(cta.getAttribute('href')).toContain('event%2Fabc123def456');
    // No claim status surfaced — anon viewer never sees who took what.
    expect(screen.queryByText(/taken|claimed/i)).not.toBeInTheDocument();
  });

  it('renders a not-found state when token is invalid', async () => {
    mocks.getEventView.mockRejectedValueOnce(new Error('event_not_found'));

    renderAt('badbadbadbadbadx');

    await waitFor(() => {
      expect(screen.getByText(/not found|link is invalid/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
  });
});
