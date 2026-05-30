/**
 * `AddMeScreen` — landing route for `/add-me/:token`. Anyone with the
 * token can accept and become friends with the link owner. Public route:
 * if the visitor isn't signed in, we point them at `/login?next=…`
 * first; the existing auth round-trip + `nextPathStorage` brings them
 * straight back here after sign-in.
 *
 * RPC: `accept_add_me(_token)` → returns the owner's uuid. RAISE
 * EXCEPTION text codes (`self_link`, `token_not_found`,
 * `not_authenticated`) are mapped by `lib/errors.ts` to stable
 * `AppErrorCode`s. For the friendly screen-specific cases we render
 * `t('addMe.<…>Err')`; for anything else we fall back to the central
 * `errorMessage` table.
 *
 * Owner preview: `get_add_me_preview(_token)` is an anon-friendly
 * SECURITY DEFINER RPC that resolves the token to a minimal profile
 * (display name, handle, avatar). We use it to humanise the title and
 * surface the inviter's avatar when available — falling back to the
 * nameless «хочет дружить» phrasing if the token is invalid or the
 * profile is disabled. CTA is not gated on preview load: accept works
 * regardless.
 *
 * On success we navigate to `/p/<ownerId>` — the friend's list,
 * which they now have permission to see thanks to the freshly-inserted
 * `friendships` row.
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { useProfile } from '../auth/useProfile';
import { useI18n } from '../i18n/useI18n';
import { errorCode, errorMessage } from '../lib/errors';
import { track } from '../lib/plausible';
import { PaperLayout } from '../components/PaperLayout';
import { Button } from '../components/Button';
import { LangToggle } from '../components/LangToggle';
import { Wordmark } from '../components/Wordmark';
import { PeekingRat, SittingRat } from '../components/rats';

interface OwnerPreview {
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
}

export function AddMeScreen() {
  const { t } = useI18n();
  const { status } = useAuth();
  const { query: profileQuery } = useProfile();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<OwnerPreview | null>(null);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    void supabase.rpc('get_add_me_preview', { _token: token }).then(({ data }) => {
      if (cancelled) return;
      const row = data?.[0];
      if (!row) return;
      setPreview({
        display_name: row.display_name,
        handle: row.handle,
        avatar_url: row.avatar_url,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Defensive: route is `/add-me/:token`, so React Router should always
  // populate it — but the param could in principle be undefined under
  // an unusual setup. Treat as a malformed link.
  if (!token) {
    return <Navigate to="/" replace />;
  }

  // #3: a freshly-signed-up (not-yet-onboarded) visitor must set their name
  // FIRST — then OnboardingScreen returns them here (via state.from) to accept.
  // /add-me is a public route, so the AuthedShell onboarding gate never fires.
  if (
    status === 'authenticated' &&
    profileQuery.status === 'ready' &&
    !profileQuery.profile.onboarded_at
  ) {
    return <Navigate to="/onboarding" replace state={{ from: `/add-me/${token}` }} />;
  }

  // When the preview has a name, the title reads «{name} хочет
  // дружить» — when it's missing (token invalid or still loading),
  // `{name}` interpolates to empty and we trim the leading space for
  // the nameless fallback.
  const title = t('addMe.title', { name: preview?.display_name ?? '' }).trimStart();

  async function handleAccept(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { data: ownerId, error: rpcError } = await supabase.rpc(
      'accept_add_me',
      { _token: token! },
    );
    if (rpcError) {
      const code = errorCode(rpcError);
      // Screen-specific copy for the two known friendly cases.
      if (code === 'selfLink') setError(t('addMe.selfErr'));
      else if (code === 'tokenNotFound') setError(t('addMe.tokenNotFoundErr'));
      else setError(errorMessage(t, rpcError));
      setBusy(false);
      return;
    }
    // Success — drop straight into the new friend's list. The
    // friendships realtime channel on the source pages will refresh
    // any open tabs on the way.
    track('RatAdded', { source: 'add_me' });
    navigate(`/p/${ownerId}`, { replace: true });
  }

  return (
    <PaperLayout narrow as="main">
      <div className="stagger-children">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--s-3)',
            marginBottom: 'var(--s-7)',
          }}
        >
          <Wordmark size="sm" />
          <LangToggle />
        </div>

        <header style={{ marginBottom: 'var(--s-5)' }}>
          {preview?.avatar_url ? (
            <div
              style={{ position: 'relative', width: 'fit-content', marginBottom: 'var(--s-4)' }}
            >
              <span
                aria-hidden
                style={{ position: 'absolute', top: -22, left: 22, transform: 'rotate(-6deg)' }}
              >
                <PeekingRat size={46} />
              </span>
              <img
                src={preview.avatar_url}
                alt=""
                style={{
                  position: 'relative',
                  width: 76,
                  height: 76,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '1px solid var(--hair-strong)',
                  display: 'block',
                }}
              />
            </div>
          ) : (
            <div aria-hidden style={{ marginBottom: 'var(--s-3)' }}>
              <PeekingRat size={64} />
            </div>
          )}
          <h1
            className="display-italic"
            style={{ fontSize: 'var(--display-m)', margin: 0, lineHeight: 1.1, letterSpacing: -1 }}
          >
            {title}
          </h1>
          {preview?.handle && (
            <p
              className="mono-meta"
              style={{ color: 'var(--ink-3)', marginTop: 'var(--s-2)', marginBottom: 0 }}
            >
              @{preview.handle}
            </p>
          )}
        </header>

        <p style={{ color: 'var(--ink-2)', lineHeight: 1.55, marginBottom: 'var(--s-5)' }}>
          {t('addMe.body')}
        </p>

        <div>
          {status === 'loading' && <p style={{ color: 'var(--ink-3)' }}>…</p>}

          {status === 'anonymous' && (
            <Link
              to={`/login?next=${encodeURIComponent(`/add-me/${token}`)}`}
              style={{ textDecoration: 'none' }}
            >
              <Button variant="primary">{t('auth.signIn')}</Button>
            </Link>
          )}

          {status === 'authenticated' && profileQuery.status !== 'ready' && (
            <p style={{ color: 'var(--ink-3)' }}>…</p>
          )}

          {status === 'authenticated' && profileQuery.status === 'ready' && (
            <>
              {error && (
                <p
                  style={{
                    color: 'var(--accent-deep)',
                    lineHeight: 1.55,
                    marginBottom: 'var(--s-4)',
                  }}
                >
                  {error}
                </p>
              )}
              <Button variant="primary" onClick={() => void handleAccept()} disabled={busy}>
                {t('addMe.cta')}
              </Button>
              <div style={{ marginTop: 'var(--s-3)' }}>
                <button
                  type="button"
                  onClick={() => navigate('/', { replace: true })}
                  className="mono-meta"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    color: 'var(--ink-3)',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  {t('addMe.notNow')}
                </button>
              </div>
            </>
          )}
        </div>

        <div
          aria-hidden
          style={{
            marginTop: 'var(--s-7)',
            display: 'flex',
            justifyContent: 'flex-end',
            opacity: 0.5,
          }}
        >
          <SittingRat size={40} />
        </div>
      </div>
    </PaperLayout>
  );
}
