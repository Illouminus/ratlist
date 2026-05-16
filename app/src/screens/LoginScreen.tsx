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
import { Navigate } from 'react-router-dom';
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
  const [email, setEmail] = useState('');
  const [form, setForm] = useState<FormState>({ kind: 'idle' });

  // Already signed in? Skip the form.
  if (status === 'authenticated') return <Navigate to="/" replace />;

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
    const err = await signInWithMagicLink(email);
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
    <PaperLayout narrow>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--s-6)' }}>
        <LangToggle />
      </div>

      <header style={{ marginBottom: 'var(--s-6)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-3)' }}>
          {t('auth.pageEyebrow')}
        </div>
        <h1
          className="display-italic"
          style={{ fontSize: 44, margin: 0, lineHeight: 1.1, letterSpacing: -1 }}
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
        </form>
      )}
    </PaperLayout>
  );
}

function SentNotice({ email }: { email: string }) {
  const { t } = useI18n();
  return (
    <div className="fade-up">
      <p
        className="display-italic"
        style={{ fontSize: 24, margin: 0, lineHeight: 1.3, color: 'var(--ink)' }}
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
