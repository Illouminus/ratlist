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
 * On success we navigate to `/p/<senderId>` — the new friend's list,
 * now visible thanks to the freshly-inserted `friendships` row.
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

export function AcceptFriendInviteScreen() {
  const { t } = useI18n();
  const { status } = useAuth();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return <Navigate to="/" replace />;
  }

  // No preview RPC for the sender's name yet — keep the title generic.
  // PR 3+ can add `get_friend_invite_preview` and surface the name here.
  const title = t('acceptFriendInvite.title', { name: '' }).trimStart();

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
    navigate(`/p/${senderId}`, { replace: true });
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
