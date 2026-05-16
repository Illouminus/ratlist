/**
 * `InviteAcceptScreen` — landing page for `/invite/:token`. Calls the
 * `redeem_invite` RPC and reports the outcome. Public route: if the
 * visitor isn't signed in, we point them at `/login` first.
 *
 * Error mapping (invite_not_found / expired / used) is handled by the
 * central `errorMessage` helper.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/useAuth';
import { useI18n } from '../../i18n/useI18n';
import { errorMessage } from '../../lib/errors';
import { PaperLayout } from '../../components/PaperLayout';
import { Button } from '../../components/Button';
import { LangToggle } from '../../components/LangToggle';

type State =
  | { kind: 'pending' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export function InviteAcceptScreen() {
  const { t } = useI18n();
  const { status } = useAuth();
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ kind: 'pending' });

  useEffect(() => {
    if (status !== 'authenticated' || !token) return undefined;
    let cancelled = false;

    void supabase
      .rpc('redeem_invite', { _token: token })
      .then(({ error }) => {
        if (cancelled) return;
        if (error) {
          setState({ kind: 'error', message: errorMessage(t, error) });
        } else {
          setState({ kind: 'success' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status, token, t]);

  return (
    <PaperLayout narrow>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--s-6)' }}>
        <LangToggle />
      </div>

      <header style={{ marginBottom: 'var(--s-6)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-3)' }}>
          {t('invite.eyebrow')}
        </div>
        <h1
          className="display-italic"
          style={{ fontSize: 'var(--display-m)', margin: 0, lineHeight: 1.1, letterSpacing: -1 }}
        >
          {t('invite.title')}
        </h1>
      </header>

      {status === 'loading' && <p style={{ color: 'var(--ink-3)' }}>…</p>}

      {status === 'anonymous' && (
        <div>
          <p style={{ color: 'var(--ink-2)', lineHeight: 1.55 }}>{t('invite.notSignedIn')}</p>
          <div style={{ marginTop: 'var(--s-4)' }}>
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <Button variant="primary">{t('auth.signIn')}</Button>
            </Link>
          </div>
        </div>
      )}

      {status === 'authenticated' && state.kind === 'pending' && (
        <p style={{ color: 'var(--ink-2)' }}>{t('invite.accepting')}</p>
      )}

      {status === 'authenticated' && state.kind === 'success' && (
        <div>
          <p
            className="display-italic"
            style={{ fontSize: 'var(--display-xs)', color: 'var(--ink)', marginBottom: 'var(--s-4)' }}
          >
            {t('invite.success', { group: '' })}
          </p>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Button variant="primary">{t('invite.successCta')}</Button>
          </Link>
        </div>
      )}

      {status === 'authenticated' && state.kind === 'error' && (
        <div>
          <p style={{ color: 'var(--accent-deep)', lineHeight: 1.55 }}>{state.message}</p>
          <div style={{ marginTop: 'var(--s-4)' }}>
            <Link to="/" style={{ textDecoration: 'none' }}>
              <Button variant="ghost">{t('invite.successCta')}</Button>
            </Link>
          </div>
        </div>
      )}
    </PaperLayout>
  );
}
