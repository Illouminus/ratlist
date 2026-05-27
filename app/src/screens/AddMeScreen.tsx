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
import { useI18n } from '../i18n/useI18n';
import { errorCode, errorMessage } from '../lib/errors';
import { PaperLayout } from '../components/PaperLayout';
import { Button } from '../components/Button';
import { LangToggle } from '../components/LangToggle';

interface OwnerPreview {
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
}

export function AddMeScreen() {
  const { t } = useI18n();
  const { status } = useAuth();
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
    navigate(`/p/${ownerId}`, { replace: true });
  }

  return (
    <PaperLayout narrow as="main">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--s-6)' }}>
        <LangToggle />
      </div>

      <header style={{ marginBottom: 'var(--s-5)' }}>
        {preview?.avatar_url && (
          <img
            src={preview.avatar_url}
            alt=""
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '1px solid var(--hair-strong)',
              marginBottom: 'var(--s-3)',
              display: 'block',
            }}
          />
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

      {status === 'loading' && <p style={{ color: 'var(--ink-3)' }}>…</p>}

      {status === 'anonymous' && (
        <Link
          to={`/login?next=${encodeURIComponent(`/add-me/${token}`)}`}
          style={{ textDecoration: 'none' }}
        >
          <Button variant="primary">{t('auth.signIn')}</Button>
        </Link>
      )}

      {status === 'authenticated' && (
        <>
          {error && (
            <p style={{ color: 'var(--accent-deep)', lineHeight: 1.55, marginBottom: 'var(--s-4)' }}>
              {error}
            </p>
          )}
          <Button
            variant="primary"
            onClick={() => void handleAccept()}
            disabled={busy}
          >
            {t('addMe.cta')}
          </Button>
        </>
      )}
    </PaperLayout>
  );
}
