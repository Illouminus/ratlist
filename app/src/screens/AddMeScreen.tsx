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
 * Owner-name preview is deferred: there's no anon-readable RPC that
 * turns a `add_me_token` into a profile name (that would invert the
 * point of the obscure-token model). PR 3+ may add `get_add_me_preview`
 * — until then we render the title with an empty name and trim the
 * leading space so it reads naturally («хочет дружить» / «wants to
 * be friends»).
 *
 * On success we navigate to `/p/<ownerId>` — the friend's list,
 * which they now have permission to see thanks to the freshly-inserted
 * `friendships` row.
 */
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { useI18n } from '../i18n/useI18n';
import { errorCode, errorMessage } from '../lib/errors';
import { PaperLayout } from '../components/PaperLayout';
import { Button } from '../components/Button';
import { LangToggle } from '../components/LangToggle';

export function AddMeScreen() {
  const { t } = useI18n();
  const { status } = useAuth();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Defensive: route is `/add-me/:token`, so React Router should always
  // populate it — but the param could in principle be undefined under
  // an unusual setup. Treat as a malformed link.
  if (!token) {
    return <Navigate to="/" replace />;
  }

  // Title interpolation: no preview RPC exists yet (see header).
  // `{name}` is rendered as empty string and we trim the leading
  // whitespace. Once `get_add_me_preview` ships we can fetch + set
  // ownerName here without any other screen change.
  const title = t('addMe.title', { name: '' }).trimStart();

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
        <h1
          className="display-italic"
          style={{ fontSize: 'var(--display-m)', margin: 0, lineHeight: 1.1, letterSpacing: -1 }}
        >
          {title}
        </h1>
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
