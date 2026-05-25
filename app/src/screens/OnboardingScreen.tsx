/**
 * `OnboardingScreen` — first-time profile setup. Shown after a successful
 * magic-link sign-in until the user picks a display name (and optionally a
 * handle). Once `complete_onboarding` succeeds, the profile row gets an
 * `onboarded_at` timestamp and `RequireAuth` stops redirecting here.
 *
 * The outer screen handles routing and async profile loading; the form
 * lives in a child component (`OnboardingForm`) that takes the loaded
 * profile as props. This way the form's input state is initialised from
 * known data on mount instead of via `useEffect`.
 */
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useProfile } from '../auth/useProfile';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/db';
import { useI18n } from '../i18n/useI18n';
import { PaperLayout } from '../components/PaperLayout';
import { Field } from '../components/Field';
import { SketchInput } from '../components/SketchInput';
import { Button } from '../components/Button';
import { LangToggle } from '../components/LangToggle';

/** Mirrors the DB CHECK constraint on profiles.handle. Empty handle is OK. */
const HANDLE_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{1,31}$/;

export function OnboardingScreen() {
  const { status } = useAuth();
  const { query, refresh } = useProfile();
  const { t } = useI18n();

  if (status === 'loading') return null;
  if (status === 'anonymous') return <Navigate to="/login" replace />;

  switch (query.status) {
    case 'loading':
    case 'anonymous':
      return null;
    case 'error':
      return (
        <PaperLayout narrow as="main">
          <p>{t('auth.genericError')}</p>
        </PaperLayout>
      );
    case 'ready': {
      if (query.profile.onboarded_at) {
        return <Navigate to="/" replace />;
      }
      return <OnboardingForm profile={query.profile} onComplete={refresh} />;
    }
  }
}

// ───────────────────────────── form ──────────────────────────────

interface OnboardingFormProps {
  profile: Profile;
  onComplete: () => Promise<void>;
}

interface SubmitError {
  field: 'displayName' | 'handle' | 'generic';
  code: 'required' | 'handleInvalid' | 'handleTaken' | 'generic';
}

function OnboardingForm({ profile, onComplete }: OnboardingFormProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  // If AuthedShellContent kicked the user here from a deep-link
  // destination (e.g. /events/<id> after auto-join from an event share
  // link), it stashed the original path in location.state.from. After
  // onboarding completes, resume that journey instead of dumping the
  // user on home. Same-origin guard at the read site so a hand-crafted
  // state object can't redirect off-domain.
  const stateFrom = (location.state as { from?: unknown } | null)?.from;
  const resumeTo =
    typeof stateFrom === 'string' && stateFrom.startsWith('/') && !stateFrom.startsWith('//')
      ? stateFrom
      : '/';

  // Seed form state from the loaded profile. No useEffect needed because
  // the parent only renders this once the profile is `ready`.
  const [displayName, setDisplayName] = useState<string>(profile.display_name);
  const [handle, setHandle] = useState<string>(profile.handle ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<SubmitError | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);

    const name = displayName.trim();
    if (name.length === 0) {
      setError({ field: 'displayName', code: 'required' });
      return;
    }

    const handleTrimmed = handle.trim();
    if (handleTrimmed.length > 0 && !HANDLE_REGEX.test(handleTrimmed)) {
      setError({ field: 'handle', code: 'handleInvalid' });
      return;
    }

    setSubmitting(true);
    const { error: rpcError } = await supabase.rpc('complete_onboarding', {
      _display_name: name,
      _handle: handleTrimmed.length > 0 ? handleTrimmed : undefined,
    });

    if (rpcError) {
      // Unique violation on `handle` means it's taken.
      const taken = rpcError.code === '23505' || rpcError.message.includes('duplicate');
      setError({
        field: taken ? 'handle' : 'generic',
        code: taken ? 'handleTaken' : 'generic',
      });
      setSubmitting(false);
      return;
    }

    await onComplete();
    setSubmitting(false);
    navigate(resumeTo, { replace: true });
  }

  const handleError =
    error?.field === 'handle'
      ? error.code === 'handleTaken'
        ? t('onboarding.handleTaken')
        : t('onboarding.handleInvalid')
      : null;

  return (
    <PaperLayout narrow as="main">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--s-6)' }}>
        <LangToggle />
      </div>

      <header style={{ marginBottom: 'var(--s-6)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-3)' }}>
          {t('onboarding.eyebrow')}
        </div>
        <h1
          className="display-italic"
          style={{ fontSize: 'var(--display-m)', margin: 0, lineHeight: 1.1, letterSpacing: -1 }}
        >
          {t('onboarding.title')}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: 'var(--ink-2)',
            marginTop: 'var(--s-3)',
            lineHeight: 1.55,
          }}
        >
          {t('onboarding.sub')}
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate>
        <Field label={t('onboarding.displayNameLabel')}>
          <SketchInput
            type="text"
            autoComplete="name"
            placeholder={t('onboarding.displayNamePh')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            invalid={error?.field === 'displayName'}
            autoFocus
            required
          />
        </Field>

        <Field
          label={t('onboarding.handleLabel')}
          hint={!handleError ? t('onboarding.handleHint') : undefined}
          error={handleError}
        >
          <SketchInput
            type="text"
            autoComplete="username"
            placeholder={t('onboarding.handlePh')}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            invalid={error?.field === 'handle'}
          />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--s-5)' }}>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? t('auth.sending') : t('onboarding.continue')}
          </Button>
        </div>

        {error?.field === 'generic' && (
          <p style={{ color: 'var(--accent-deep)', marginTop: 'var(--s-4)', fontSize: 13 }}>
            {t('auth.genericError')}
          </p>
        )}
      </form>
    </PaperLayout>
  );
}
