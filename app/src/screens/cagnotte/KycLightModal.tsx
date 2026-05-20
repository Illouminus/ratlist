/**
 * `<KycLightModal>` — one-time KYC LIGHT data collection shown before
 * a user can create their first cagnotte. Collects personal + banking
 * details required by Mangopay for coordinator onboarding.
 *
 * Shown ONCE per user. On success, the calling screen stores the
 * returned `mangopay_user_id` so the modal is never triggered again.
 *
 * Same chrome as ReportDialog / ConfirmDialog: paper card on a scrim,
 * focus-trapped while open (useFocusTrap), Escape closes.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../i18n/useI18n';
import { useProfile } from '../../auth/useProfile';
import { errorMessage } from '../../lib/errors';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { Button } from '../../components/Button';
import { SketchInput } from '../../components/SketchInput';

// ── Country list ────────────────────────────────────────────────────────────

const COUNTRIES: readonly { code: string; label: string }[] = [
  { code: 'FR', label: 'France' },
  { code: 'DE', label: 'Germany' },
  { code: 'ES', label: 'Spain' },
  { code: 'IT', label: 'Italy' },
  { code: 'BE', label: 'Belgium' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States' },
  { code: 'PT', label: 'Portugal' },
  { code: 'AT', label: 'Austria' },
  { code: 'CH', label: 'Switzerland' },
  { code: 'PL', label: 'Poland' },
  { code: 'SE', label: 'Sweden' },
  { code: 'NO', label: 'Norway' },
  { code: 'DK', label: 'Denmark' },
  { code: 'FI', label: 'Finland' },
  { code: 'OTHER', label: 'Other' },
];

// ── IBAN auto-formatter ─────────────────────────────────────────────────────

function formatIban(raw: string): string {
  // strip spaces, uppercase
  const clean = raw.replace(/\s+/g, '').toUpperCase();
  // reinsert space every 4 chars
  return clean.replace(/(.{4})/g, '$1 ').trimEnd();
}

function ibanIsValid(iban: string): boolean {
  const stripped = iban.replace(/\s+/g, '');
  return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(stripped);
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface KycLightModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (mangopayUserId: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function KycLightModal({ open, onClose, onSuccess }: KycLightModalProps) {
  const { t } = useI18n();
  const { query: profileQuery } = useProfile();
  const profile = profileQuery.status === 'ready' ? profileQuery.profile : null;

  const cardRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(cardRef, open);

  // ── Form state ─────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [nationality, setNationality] = useState('FR');
  const [countryOfResidence, setCountryOfResidence] = useState('FR');
  const [iban, setIban] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [bankCountry, setBankCountry] = useState('FR');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState(false);

  // ── Pre-fill name from profile on open ────────────────────────────────
  // setState-in-effect: fires after a yield, only on open → not a same-tick
  // render storm. Follows the project's hook convention.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (profile?.display_name) {
      const parts = profile.display_name.trim().split(/\s+/);
      setFirstName(parts[0] ?? '');
      setLastName(parts.slice(1).join(' '));
    }
    setError(null);
    setValidationError(false);
    setSubmitting(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, profile]);

  // ── ESC handler ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // ── Validation ─────────────────────────────────────────────────────────
  function validate(): boolean {
    if (!firstName.trim() || !lastName.trim()) return false;
    if (!birthday) return false;
    const dob = new Date(birthday);
    if (isNaN(dob.getTime()) || dob >= new Date()) return false;
    if (!ibanIsValid(iban)) return false;
    if (!addressLine1.trim() || !city.trim() || !postalCode.trim()) return false;
    return true;
  }

  // ── Submit ─────────────────────────────────────────────────────────────
  async function handleSubmit(): Promise<void> {
    if (!validate()) {
      setValidationError(true);
      return;
    }
    setValidationError(false);
    setSubmitting(true);
    setError(null);

    const { data, error: invokeErr } = await supabase.functions.invoke<{
      mangopay_user_id: string;
      already_exists: boolean;
    }>('mangopay-kyc-light', {
      body: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthday,
        nationality,
        countryOfResidence,
        iban: iban.replace(/\s+/g, ''),
        addressLine1: addressLine1.trim(),
        city: city.trim(),
        postalCode: postalCode.trim(),
        country: bankCountry,
      },
    });

    setSubmitting(false);

    if (invokeErr || !data) {
      setError(errorMessage(t, invokeErr ?? new Error('kyc_failed')));
      return;
    }

    onSuccess(data.mangopay_user_id);
  }

  // ── Select style ────────────────────────────────────────────────────────
  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 0',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid var(--hair-strong)',
    fontFamily: 'var(--font-body)',
    fontSize: 15,
    color: 'var(--ink)',
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('cagnotte.kyc.title')}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(43, 38, 32, 0.5)',
        display: 'grid',
        placeItems: 'start center',
        padding: 'var(--s-5) var(--s-4)',
        overflowY: 'auto',
        zIndex: 1200,
        animation: 'fadeIn var(--motion) ease-out',
      }}
    >
      <div
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        className="fade-up"
        style={{
          width: 'min(500px, 100%)',
          background: 'var(--paper)',
          border: '1px solid var(--hair-strong)',
          borderRadius: 'var(--r-3)',
          padding: 'var(--s-6) var(--s-5) var(--s-5)',
          boxShadow: '0 16px 48px rgba(43, 38, 32, 0.22)',
          position: 'relative',
        }}
      >
        {/* Decorative inner hairline at top */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            right: 8,
            height: 1,
            background: 'var(--hair)',
            pointerEvents: 'none',
          }}
        />

        {/* Close button */}
        <button
          type="button"
          aria-label="close"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14,
            right: 16,
            background: 'none',
            border: 'none',
            color: 'var(--ink-3)',
            fontSize: 22,
            lineHeight: 1,
            cursor: 'pointer',
            padding: '4px 6px',
          }}
        >
          ×
        </button>

        {/* Header */}
        <div
          className="mono-meta"
          style={{ color: 'var(--accent-deep)', marginBottom: 'var(--s-2)' }}
        >
          {t('cagnotte.kyc.eyebrow')}
        </div>
        <h2
          className="display-italic"
          style={{
            margin: 0,
            fontSize: 'var(--display-m)',
            lineHeight: 1.15,
            letterSpacing: -0.5,
            color: 'var(--ink)',
            marginBottom: 'var(--s-3)',
          }}
        >
          {t('cagnotte.kyc.title')}
        </h2>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--ink-2)',
            marginBottom: 'var(--s-5)',
          }}
        >
          {t('cagnotte.kyc.lede')}
        </p>

        {/* ── Section: about you ─────────────────────────────────────── */}
        <SectionLabel>{t('cagnotte.kyc.aboutYou')}</SectionLabel>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 var(--s-4)' }}>
          <FieldRow label={t('cagnotte.kyc.firstName')}>
            <SketchInput
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              disabled={submitting}
            />
          </FieldRow>
          <FieldRow label={t('cagnotte.kyc.lastName')}>
            <SketchInput
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
              disabled={submitting}
            />
          </FieldRow>
        </div>

        <FieldRow label={t('cagnotte.kyc.birthday')}>
          <SketchInput
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            disabled={submitting}
            style={{ colorScheme: 'light' }}
          />
        </FieldRow>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 var(--s-4)' }}>
          <FieldRow label={t('cagnotte.kyc.nationality')}>
            <select
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              disabled={submitting}
              style={selectStyle}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label={t('cagnotte.kyc.countryOfResidence')}>
            <select
              value={countryOfResidence}
              onChange={(e) => setCountryOfResidence(e.target.value)}
              disabled={submitting}
              style={selectStyle}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </FieldRow>
        </div>

        {/* ── Divider ────────────────────────────────────────────────── */}
        <div
          style={{
            borderTop: '1px solid var(--hair)',
            margin: 'var(--s-5) 0 var(--s-4)',
          }}
        />

        {/* ── Section: where the money lands ─────────────────────────── */}
        <SectionLabel>{t('cagnotte.kyc.whereMoneyLands')}</SectionLabel>

        <FieldRow label={t('cagnotte.kyc.iban')}>
          <SketchInput
            value={iban}
            onChange={(e) => setIban(formatIban(e.target.value))}
            placeholder="FR76 …"
            autoComplete="off"
            disabled={submitting}
            style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.03em' }}
          />
        </FieldRow>

        <FieldRow label={t('cagnotte.kyc.addressLine1')}>
          <SketchInput
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            autoComplete="street-address"
            disabled={submitting}
          />
        </FieldRow>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 var(--s-4)' }}>
          <FieldRow label={t('cagnotte.kyc.city')}>
            <SketchInput
              value={city}
              onChange={(e) => setCity(e.target.value)}
              autoComplete="address-level2"
              disabled={submitting}
            />
          </FieldRow>
          <FieldRow label={t('cagnotte.kyc.postalCode')}>
            <SketchInput
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              autoComplete="postal-code"
              disabled={submitting}
            />
          </FieldRow>
        </div>

        <FieldRow label={t('cagnotte.kyc.country')}>
          <select
            value={bankCountry}
            onChange={(e) => setBankCountry(e.target.value)}
            disabled={submitting}
            style={selectStyle}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </FieldRow>

        {/* ── Reassurance block ──────────────────────────────────────── */}
        <div
          style={{
            background: 'var(--paper-edge)',
            borderLeft: '2px solid var(--hair-strong)',
            borderRadius: 'var(--r-1)',
            padding: '10px 14px',
            margin: 'var(--s-4) 0 var(--s-3)',
            fontSize: 12.5,
            lineHeight: 1.55,
            color: 'var(--ink-2)',
          }}
        >
          {t('cagnotte.kyc.reassurance')}
          <span
            style={{
              display: 'block',
              marginTop: 6,
              fontSize: 11,
              color: 'var(--ink-3)',
            }}
          >
            {t('cagnotte.kyc.confirm')}{' '}
            <a
              href="https://www.mangopay.com/terms/MANGOPAY_Terms-EN.pdf"
              target="_blank"
              rel="noreferrer"
              style={{
                color: 'var(--accent-deep)',
                textDecoration: 'underline',
                textDecorationThickness: 1,
                textUnderlineOffset: 2,
              }}
            >
              Mangopay terms
            </a>
            .
          </span>
        </div>

        {/* Validation / server error */}
        {validationError && (
          <p
            role="alert"
            data-testid="kyc-validation-error"
            style={{
              marginBottom: 'var(--s-3)',
              fontSize: 13,
              color: 'var(--accent-deep)',
            }}
          >
            {t('cagnotte.kyc.validation')}
          </p>
        )}
        {error && (
          <p
            role="alert"
            data-testid="kyc-server-error"
            style={{
              marginBottom: 'var(--s-3)',
              fontSize: 13,
              color: 'var(--accent-deep)',
            }}
          >
            {error}
          </p>
        )}

        {/* ── Actions ────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-4)',
            marginTop: 'var(--s-4)',
          }}
        >
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            style={{
              padding: '11px 28px',
              background: submitting ? 'var(--paper-edge)' : 'var(--ink)',
              color: submitting ? 'var(--ink-3)' : 'var(--paper)',
              border: 'none',
              borderRadius: '999px',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: '0.04em',
              cursor: submitting ? 'default' : 'pointer',
              transition: 'background var(--motion-fast) ease-out',
            }}
          >
            {submitting ? t('cagnotte.kyc.submitting') : t('cagnotte.kyc.confirm')}
          </button>

          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t('cagnotte.kyc.later')}
          </Button>
        </div>

        {/* Secured by */}
        <div
          style={{
            textAlign: 'right',
            fontSize: 10,
            color: 'var(--ink-3)',
            marginTop: 'var(--s-4)',
            opacity: 0.7,
            letterSpacing: '0.04em',
          }}
        >
          <span style={{ color: 'var(--accent)', marginRight: 4 }}>●</span>
          {t('cagnotte.kyc.powered')}
        </div>
      </div>
    </div>
  );
}

// ── Small internal sub-components ──────────────────────────────────────────

interface FieldRowProps {
  label: string;
  children: React.ReactNode;
}

function FieldRow({ label, children }: FieldRowProps) {
  return (
    <div style={{ marginBottom: 'var(--s-4)' }}>
      <div
        className="mono-meta"
        style={{
          marginBottom: 'var(--s-2)',
          color: 'var(--ink-3)',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

interface SectionLabelProps {
  children: React.ReactNode;
}

function SectionLabel({ children }: SectionLabelProps) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-hand)',
        fontSize: 17,
        color: 'var(--ink-3)',
        marginBottom: 'var(--s-3)',
        transform: 'translateX(-2px) rotate(-0.8deg)',
        display: 'inline-block',
      }}
    >
      {children}
    </div>
  );
}
