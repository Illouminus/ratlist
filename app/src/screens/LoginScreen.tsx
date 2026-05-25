/**
 * `LoginScreen` — magic-link sign-in. Single email field, submit, then a
 * "check your inbox" confirmation. No password, no OAuth (yet).
 *
 * Form states:
 *   idle    — waiting for user input
 *   sending — request in flight
 *   sent    — magic link dispatched
 *   error   — server returned an error
 *
 * On submission we let the AuthProvider call `signInWithOtp`; any error is
 * already mapped to a stable code we translate via i18n.
 */
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useI18n } from '../i18n/useI18n';
import { PaperLayout } from '../components/PaperLayout';
import { Field } from '../components/Field';
import { SketchInput } from '../components/SketchInput';
import { Button } from '../components/Button';
import { LangToggle } from '../components/LangToggle';

type FormState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'error'; code: 'invalidEmail' | 'generic' };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginScreen() {
  const { t } = useI18n();
  const { signInWithMagicLink, status } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [form, setForm] = useState<FormState>({ kind: 'idle' });

  // Preserve the deep-link target across the auth round-trip. Used for
  // flows like clicking «Sign in» on /event/<token> → we want to come
  // back to that page (which then auto-joins). Only same-origin paths
  // are honored; AuthProvider drops anything suspicious.
  const nextPath = searchParams.get('next');

  // Already signed in? Skip the form. Respect ?next= so a logged-in
  // visitor who clicked an event link still lands on the event.
  if (status === 'authenticated') {
    const safeNext = nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/';
    return <Navigate to={safeNext} replace />;
  }

  function handleEmailChange(next: string): void {
    setEmail(next);
    // Reset any prior validation error as the user starts editing again.
    if (form.kind === 'error') setForm({ kind: 'idle' });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (form.kind === 'sending' || form.kind === 'sent') return;

    if (!EMAIL_REGEX.test(email.trim())) {
      setForm({ kind: 'error', code: 'invalidEmail' });
      return;
    }

    setForm({ kind: 'sending' });
    const err = await signInWithMagicLink(email, nextPath);
    if (err) {
      setForm({ kind: 'error', code: err === 'invalidEmail' ? 'invalidEmail' : 'generic' });
      return;
    }
    setForm({ kind: 'sent', email: email.trim() });
  }

  const errorCode = form.kind === 'error' ? form.code : null;
  const errorText =
    errorCode === 'invalidEmail'
      ? t('auth.invalidEmail')
      : errorCode === 'generic'
        ? t('auth.genericError')
        : null;

  return (
    <PaperLayout narrow as="main">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--s-6)' }}>
        <LangToggle />
      </div>

      <header style={{ marginBottom: 'var(--s-6)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-3)' }}>
          {t('auth.pageEyebrow')}
        </div>
        <h1
          className="display-italic"
          style={{ fontSize: 'var(--display-l)', margin: 0, lineHeight: 1.1, letterSpacing: -1 }}
        >
          {t('auth.pageTitle')}
        </h1>
        <p
          className="marginalia"
          style={{ fontSize: 18, color: 'var(--accent)', marginTop: 'var(--s-2)', transform: 'rotate(-1deg)' }}
        >
          {t('auth.pageHint')}
        </p>
      </header>

      {form.kind === 'sent' ? (
        <SentNotice email={form.email} />
      ) : (
        <>
          <GoogleButton nextPath={nextPath} />
          <OrDivider />
          <form onSubmit={handleSubmit} noValidate>
            <Field label={t('auth.emailLabel')} error={errorText}>
              <SketchInput
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={t('auth.emailPh')}
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                autoFocus
                required
                invalid={errorCode !== null}
              />
            </Field>

            <Button
              type="submit"
              variant="primary"
              disabled={form.kind === 'sending' || email.length === 0}
            >
              {form.kind === 'sending' ? t('auth.sending') : t('auth.sendMagic')}
            </Button>

            <AgeAndLegalNotice />
          </form>
        </>
      )}
    </PaperLayout>
  );
}

/**
 * Continue-with-Google button. Triggers the OAuth flow via Supabase;
 * the browser is then redirected to Google and back to /auth/callback,
 * where AuthCallbackScreen takes over.
 *
 * No loading state needed because clicking immediately navigates the
 * whole window away — by the time we'd render "loading" the user is
 * already on accounts.google.com.
 */
function GoogleButton({ nextPath }: { nextPath: string | null }) {
  const { signInWithGoogle } = useAuth();
  const { t } = useI18n();

  async function handleClick(): Promise<void> {
    await signInWithGoogle(nextPath);
    // If Supabase returns an error we currently just no-op — Supabase
    // already logs to the console and the user can fall back to the
    // magic-link form below.
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--s-3)',
        padding: '12px 18px',
        background: 'var(--paper)',
        border: '1px solid var(--hair-strong)',
        borderRadius: 'var(--r-2)',
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        fontWeight: 500,
        color: 'var(--ink)',
      }}
    >
      <GoogleMark />
      <span>{t('auth.continueWithGoogle')}</span>
    </button>
  );
}

/** Official Google "G" mark, simplified SVG. Inline so we don't ship a
 *  3 KB PNG just for this. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable={false}>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.79 2.71v2.26h2.9c1.69-1.56 2.67-3.86 2.67-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.46-.81 5.95-2.18l-2.9-2.26c-.81.54-1.83.86-3.05.86-2.34 0-4.33-1.58-5.04-3.7H.96v2.33A8.99 8.99 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.95H.96A8.99 8.99 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.96 8.96 0 0 0 9 0 8.99 8.99 0 0 0 .96 4.95l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

/** Hairline horizontal rule with a tiny eyebrow word in the middle. */
function OrDivider() {
  const { t } = useI18n();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s-3)',
        margin: 'var(--s-5) 0',
        color: 'var(--ink-3)',
      }}
    >
      <span style={{ flex: 1, height: 1, background: 'var(--hair)' }} />
      <span className="mono-meta">{t('auth.or')}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--hair)' }} />
    </div>
  );
}

/**
 * Implicit-consent notice under the submit button: clicking "send the
 * link" counts as confirming 13+ and accepting Terms / Privacy. CNIL
 * accepts this pattern for processing strictly necessary to provide the
 * service (auth) — no separate checkbox needed.
 */
function AgeAndLegalNotice() {
  const { t } = useI18n();
  return (
    <p
      className="mono-meta"
      style={{
        marginTop: 'var(--s-4)',
        color: 'var(--ink-3)',
        lineHeight: 1.5,
      }}
    >
      {t('auth.ageConfirm')}{' '}
      <Link to="/legal/terms" style={{ color: 'var(--ink-2)' }}>
        {t('auth.ageConfirmTerms')}
      </Link>{' '}
      {t('auth.ageConfirmAnd')}{' '}
      <Link to="/legal/privacy" style={{ color: 'var(--ink-2)' }}>
        {t('auth.ageConfirmPrivacy')}
      </Link>
      .
    </p>
  );
}

function SentNotice({ email }: { email: string }) {
  const { t } = useI18n();
  return (
    <div className="fade-up">
      <p
        className="display-italic"
        style={{ fontSize: 'var(--display-s)', margin: 0, lineHeight: 1.3, color: 'var(--ink)' }}
      >
        {t('auth.magicSent')}
      </p>
      <p style={{ marginTop: 'var(--s-3)', color: 'var(--ink-2)', lineHeight: 1.55 }}>
        {t('auth.magicSentBody')}
      </p>
      <p className="mono-meta" style={{ marginTop: 'var(--s-5)' }}>
        → {email}
      </p>
    </div>
  );
}
