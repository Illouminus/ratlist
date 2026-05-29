/**
 * `AcceptFriendInviteScreen` — landing route for `/friend-invite/:token`.
 * Reached from the email sent by `send-friend-invite`. Only the
 * recipient (matching email) can accept — `accept_friend_invite`
 * verifies that server-side. Public route: if the visitor isn't signed
 * in, we point them at `/login?next=…` first; the round-trip via
 * `nextPathStorage` brings them back here after auth.
 *
 * RPC: `accept_friend_invite(_token)` → returns the sender's uuid.
 * Possible RAISE EXCEPTION codes:
 *   - `self_invite`       — caller is the sender (shouldn't happen via email but possible)
 *   - `token_not_found`   — bad token
 *   - `already_accepted`  — invite was already redeemed
 *   - `email_mismatch`    — caller signed in with a different email
 *   - `not_authenticated` — handled by the anon branch above
 * Friendly screen-specific copy lives under `acceptFriendInvite.*Err`;
 * any other code falls through to the central `errorMessage`.
 *
 * Sender preview: `get_friend_invite_preview(_token)` (SECURITY DEFINER,
 * anon-friendly) resolves the token to the sender's profile plus the
 * recipient email. We use it to humanise the title and let the
 * recipient sanity-check which inbox the invite was sent to. The RPC
 * filters out already-accepted invites — once used, preview returns
 * zero rows and we fall back to the nameless title. CTA is not gated
 * on preview load.
 *
 * On success we navigate to `/p/<senderId>` — the new friend's list,
 * now visible thanks to the freshly-inserted `friendships` row.
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { useI18n } from '../i18n/useI18n';
import { errorCode, errorMessage } from '../lib/errors';
import { track } from '../lib/plausible';
import { PaperLayout } from '../components/PaperLayout';
import { Button } from '../components/Button';
import { LangToggle } from '../components/LangToggle';

interface SenderPreview {
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  to_email: string | null;
}

export function AcceptFriendInviteScreen() {
  const { t } = useI18n();
  const { status } = useAuth();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<SenderPreview | null>(null);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    void supabase
      .rpc('get_friend_invite_preview', { _token: token })
      .then(({ data }) => {
        if (cancelled) return;
        const row = data?.[0];
        if (!row) return;
        setPreview({
          display_name: row.display_name,
          handle: row.handle,
          avatar_url: row.avatar_url,
          to_email: row.to_email,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) {
    return <Navigate to="/" replace />;
  }

  const title = t('acceptFriendInvite.title', {
    name: preview?.display_name ?? '',
  }).trimStart();

  async function handleAccept(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { data: senderId, error: rpcError } = await supabase.rpc(
      'accept_friend_invite',
      { _token: token! },
    );
    if (rpcError) {
      const code = errorCode(rpcError);
      // Friendly screen-specific copy for the well-known cases.
      if (code === 'selfInvite') setError(t('acceptFriendInvite.selfErr'));
      else if (code === 'tokenNotFound') setError(t('acceptFriendInvite.tokenNotFoundErr'));
      else if (code === 'alreadyAccepted') setError(t('acceptFriendInvite.alreadyAcceptedErr'));
      else if (code === 'emailMismatch') setError(t('acceptFriendInvite.emailMismatchErr'));
      else setError(errorMessage(t, rpcError));
      setBusy(false);
      return;
    }
    track('RatAdded', { source: 'invite' });
    navigate(`/p/${senderId}`, { replace: true });
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
        {preview?.to_email && (
          <p
            className="mono-meta"
            style={{ color: 'var(--ink-3)', marginTop: 'var(--s-2)', marginBottom: 0 }}
          >
            {t('acceptFriendInvite.inviteFor', { email: preview.to_email })}
          </p>
        )}
      </header>

      <p style={{ color: 'var(--ink-2)', lineHeight: 1.55, marginBottom: 'var(--s-5)' }}>
        {t('acceptFriendInvite.body')}
      </p>

      {status === 'loading' && <p style={{ color: 'var(--ink-3)' }}>…</p>}

      {status === 'anonymous' && (
        <Link
          to={`/login?next=${encodeURIComponent(`/friend-invite/${token}`)}`}
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
            {t('acceptFriendInvite.cta')}
          </Button>
        </>
      )}
    </PaperLayout>
  );
}
