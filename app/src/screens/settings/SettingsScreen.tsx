/**
 * `SettingsScreen` — `/settings`. The user's "your corner" — profile
 * fields, avatar, language preference, and the GDPR-mandated danger
 * zone (export own data, delete account).
 *
 * Sections live as sibling sub-components in this file. They share the
 * same `Profile` row (loaded once via `useProfile`) but otherwise own
 * their async state independently — so a slow avatar upload never
 * blocks editing your handle.
 *
 * The delete flow uses inline two-step confirmation rather than a
 * native dialog: clicking «delete account» reveals an input prompt
 * asking for the handle (or display name) verbatim, and the final
 * destructive button stays disabled until the typed value matches.
 * Avoids a modal-on-modal stack when the RPC rejects with
 * sole_admin_of_groups and we have to surface the list of blocked
 * circles.
 */
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { useProfile } from '../../auth/useProfile';
import { useGroups } from '../../groups/useGroups';
import { uploadAvatar } from '../../auth/uploadAvatar';
import {
  deleteMyAccount,
  downloadJson,
  exportMyData,
  type DeleteFailure,
} from '../../auth/accountActions';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { useI18n } from '../../i18n/useI18n';
import type { Profile } from '../../lib/db';
import { PaperLayout } from '../../components/PaperLayout';
import { Field } from '../../components/Field';
import { SketchInput } from '../../components/SketchInput';
import { Button } from '../../components/Button';
import { ImageCropDialog } from '../../components/ImageCropDialog';
import { LangToggle } from '../../components/LangToggle';
import { useToast } from '../../components/useToast';

/** Mirrors the handle CHECK constraint on profiles.handle. */
const HANDLE_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{1,31}$/;

export function SettingsScreen() {
  const { query, refresh } = useProfile();
  const { t } = useI18n();

  switch (query.status) {
    case 'loading':
    case 'anonymous':
      return null;
    case 'error':
      return (
        <PaperLayout narrow>
          <p>{t('auth.genericError')}</p>
        </PaperLayout>
      );
    case 'ready':
      return <Loaded profile={query.profile} onRefresh={refresh} />;
  }
}

// ─────────────────────────── orchestration ───────────────────────────

interface LoadedProps {
  profile: Profile;
  onRefresh: () => Promise<void>;
}

function Loaded({ profile, onRefresh }: LoadedProps) {
  const { t } = useI18n();
  return (
    <PaperLayout narrow>
      <Header />

      <Section
        title={t('settings.profileSection')}
        sub={t('settings.profileSub')}
      >
        <ProfileForm profile={profile} onSaved={onRefresh} />
      </Section>

      <Section
        title={t('settings.avatarSection')}
        sub={t('settings.avatarSub')}
      >
        <AvatarPanel profile={profile} onChanged={onRefresh} />
      </Section>

      <Section
        title={t('settings.appearanceSection')}
        sub={t('settings.appearanceSub')}
      >
        <div style={{ marginTop: 'var(--s-3)' }}>
          <LangToggle />
        </div>
      </Section>

      <Section title={t('settings.circlesSection')} sub={t('settings.circlesSub')}>
        <CirclesPanel />
      </Section>

      <DangerZone profile={profile} />
    </PaperLayout>
  );
}

function Header() {
  const { t } = useI18n();
  return (
    <header style={{ marginBottom: 'var(--s-7)' }}>
      <div className="mono-meta" style={{ marginBottom: 'var(--s-3)' }}>
        {t('settings.eyebrow')}
      </div>
      <h1
        className="display-italic"
        style={{
          fontSize: 'var(--display-l)',
          margin: 0,
          lineHeight: 1.05,
          letterSpacing: -1,
          whiteSpace: 'pre-line',
        }}
      >
        {t('settings.title')}
      </h1>
      <p
        style={{
          marginTop: 'var(--s-3)',
          fontSize: 14,
          color: 'var(--ink-2)',
          maxWidth: 480,
          lineHeight: 1.55,
        }}
      >
        {t('settings.sub')}
      </p>
    </header>
  );
}

interface SectionProps {
  title: string;
  sub: string;
  children: React.ReactNode;
}

/** Small hairline-bordered section with eyebrow title + helper text. */
function Section({ title, sub, children }: SectionProps) {
  return (
    <section
      style={{
        paddingTop: 'var(--s-5)',
        paddingBottom: 'var(--s-5)',
        borderTop: '1px solid var(--hair)',
      }}
    >
      <h2
        className="mono-meta"
        style={{
          margin: 0,
          fontSize: 12,
          color: 'var(--ink)',
        }}
      >
        {title}
      </h2>
      <p
        style={{
          margin: 'var(--s-2) 0 var(--s-4)',
          fontSize: 13,
          color: 'var(--ink-3)',
          lineHeight: 1.5,
        }}
      >
        {sub}
      </p>
      {children}
    </section>
  );
}

// ─────────────────────────── circles panel ───────────────────────────

/** Tiny widget that lists the user's circles + a link to manage them.
 *  Doesn't reproduce GroupsScreen here — that screen is the canonical
 *  place to rename / invite / kick. Settings just provides discovery. */
function CirclesPanel() {
  const { t } = useI18n();
  const { query } = useGroups();

  if (query.status === 'loading') {
    return <p className="mono-meta" style={{ color: 'var(--ink-3)' }}>…</p>;
  }
  if (query.status === 'anonymous') return null;
  if (query.status === 'error') {
    return (
      <p style={{ color: 'var(--accent-deep)', fontSize: 13 }}>
        {errorMessage(t, query.error)}
      </p>
    );
  }

  const { groups } = query;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
      {groups.length === 0 ? (
        <p style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: 14, margin: 0 }}>
          {t('settings.circlesEmpty')}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {groups.map((g) => (
            <li
              key={g.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                padding: '4px 0',
                fontSize: 14,
              }}
            >
              <span>
                {g.emoji && <span aria-hidden style={{ marginRight: 6 }}>{g.emoji}</span>}
                <strong style={{ fontWeight: 600 }}>{g.name}</strong>
                <span className="mono-meta" style={{ marginLeft: 'var(--s-2)', color: 'var(--ink-3)' }}>
                  {g.member_count} · {g.role}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/groups"
        className="mono-meta"
        style={{
          color: 'var(--accent)',
          textDecoration: 'none',
          marginTop: 'var(--s-3)',
        }}
      >
        {t('settings.circlesManage')} →
      </Link>
    </div>
  );
}

// ─────────────────────────── profile form ───────────────────────────

interface ProfileFormProps {
  profile: Profile;
  onSaved: () => Promise<void>;
}

function ProfileForm({ profile, onSaved }: ProfileFormProps) {
  const { t } = useI18n();
  const toast = useToast();

  const [displayName, setDisplayName] = useState(profile.display_name);
  const [handle, setHandle] = useState(profile.handle ?? '');
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: 'name' | 'handle'; key: string } | null>(
    null,
  );

  const dirty = displayName.trim() !== profile.display_name || handle.trim() !== (profile.handle ?? '');

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setFieldError(null);

    const name = displayName.trim();
    if (name.length === 0) {
      setFieldError({ field: 'name', key: 'errors.displayNameRequired' });
      return;
    }

    const handleTrim = handle.trim();
    if (handleTrim.length > 0 && !HANDLE_REGEX.test(handleTrim)) {
      setFieldError({ field: 'handle', key: 'errors.handleInvalidFormat' });
      return;
    }

    setSaving(true);
    // Direct update — RLS allows self-update on profiles. `handle: null`
    // clears it; the column is nullable.
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name, handle: handleTrim.length > 0 ? handleTrim : null })
      .eq('id', profile.id);
    setSaving(false);

    if (error) {
      const msg = errorMessage(t, error);
      // Unique violation maps to handleTaken — attribute it to the field
      // so the input gets the invalid styling.
      if (msg === t('errors.handleTaken')) {
        setFieldError({ field: 'handle', key: 'errors.handleTaken' });
      } else {
        toast.show(msg);
      }
      return;
    }

    await onSaved();
    toast.show(t('settings.profileSavedToast'));
  }

  const handleError =
    fieldError?.field === 'handle' ? t(fieldError.key) : null;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Field
        label={t('settings.displayNameLabel')}
        error={fieldError?.field === 'name' ? t(fieldError.key) : null}
      >
        <SketchInput
          type="text"
          autoComplete="name"
          placeholder={t('settings.displayNamePh')}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          invalid={fieldError?.field === 'name'}
          required
        />
      </Field>

      <Field
        label={t('settings.handleLabel')}
        hint={!handleError ? t('settings.handleHint') : undefined}
        error={handleError}
      >
        <SketchInput
          type="text"
          autoComplete="username"
          placeholder={t('settings.handlePh')}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          invalid={fieldError?.field === 'handle'}
        />
      </Field>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--s-4)' }}>
        <Button type="submit" variant="primary" disabled={saving || !dirty}>
          {saving ? t('settings.savingProfile') : t('settings.saveProfile')}
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────── avatar ───────────────────────────

interface AvatarPanelProps {
  profile: Profile;
  onChanged: () => Promise<void>;
}

function AvatarPanel({ profile, onChanged }: AvatarPanelProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  function handlePick(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    // Reset so picking the same file twice (e.g. after cancelling crop)
    // still fires onChange.
    e.target.value = '';
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
  }

  async function handleCropSave(file: File): Promise<void> {
    setCropSrc(null);
    setUploading(true);
    const result = await uploadAvatar(file, profile.id);
    if ('error' in result) {
      toast.show(errorMessage(t, result.error));
      setUploading(false);
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: result.url })
      .eq('id', profile.id);
    setUploading(false);

    if (error) {
      toast.show(errorMessage(t, error));
      return;
    }
    await onChanged();
    toast.show(t('settings.avatarUpdatedToast'));
  }

  async function handleRemove(): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', profile.id);
    if (error) {
      toast.show(errorMessage(t, error));
      return;
    }
    await onChanged();
    toast.show(t('settings.avatarRemovedToast'));
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)' }}>
      <AvatarPreview profile={profile} />

      <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
        <label
          className="mono-meta"
          style={{
            background: 'transparent',
            border: '1px solid var(--hair-strong)',
            padding: '8px 14px',
            borderRadius: 'var(--r-2)',
            cursor: uploading ? 'wait' : 'pointer',
            color: 'var(--ink-2)',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading
            ? t('settings.avatarUploading')
            : profile.avatar_url
              ? t('settings.avatarReplace')
              : t('settings.avatarUpload')}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handlePick}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </label>

        {profile.avatar_url && (
          <button
            type="button"
            onClick={() => void handleRemove()}
            className="mono-meta"
            style={{
              background: 'transparent',
              border: '1px solid var(--hair)',
              padding: '8px 14px',
              borderRadius: 'var(--r-2)',
              cursor: 'pointer',
              color: 'var(--ink-3)',
            }}
          >
            {t('settings.avatarRemove')}
          </button>
        )}
      </div>

      {cropSrc && (
        <ImageCropDialog
          open
          imageSrc={cropSrc}
          aspect={1}
          cropShape="round"
          outputMaxDim={512}
          filename="avatar.jpg"
          onCancel={() => setCropSrc(null)}
          onSave={(file) => void handleCropSave(file)}
        />
      )}
    </div>
  );
}

/** 64-px round preview — image if set, otherwise the display-name initial. */
function AvatarPreview({ profile }: { profile: Profile }) {
  const initial = profile.display_name.charAt(0).toUpperCase() || '?';
  if (profile.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt=""
        width={64}
        height={64}
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          objectFit: 'cover',
          boxShadow: 'inset 0 0 0 1px var(--hair-strong)',
        }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        width: 64,
        height: 64,
        flexShrink: 0,
        borderRadius: '50%',
        background: 'var(--accent-wash)',
        color: 'var(--ink)',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'var(--font-display)',
        fontStyle: 'italic',
        fontWeight: 500,
        fontSize: 26,
        boxShadow: 'inset 0 0 0 1px var(--hair-strong)',
      }}
    >
      {initial}
    </span>
  );
}

// ─────────────────────────── danger zone ───────────────────────────

interface DangerZoneProps {
  profile: Profile;
}

type DeleteUiState =
  | { kind: 'idle' }
  | { kind: 'confirming'; typed: string }
  | { kind: 'deleting' }
  | { kind: 'blocked'; failure: DeleteFailure };

function DangerZone({ profile }: DangerZoneProps) {
  const { t } = useI18n();
  const toast = useToast();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const [exporting, setExporting] = useState(false);
  const [del, setDel] = useState<DeleteUiState>({ kind: 'idle' });

  // The token the user has to type to confirm deletion. Prefer handle
  // (short, unambiguous, lowercased) then fall back to display_name.
  const confirmToken = profile.handle?.trim() ? profile.handle.trim() : profile.display_name.trim();

  async function handleExport(): Promise<void> {
    setExporting(true);
    const result = await exportMyData();
    setExporting(false);
    if (!result.ok) {
      toast.show(errorMessage(t, result.error));
      return;
    }
    downloadJson(result.data, 'ratlist-export');
    toast.show(t('settings.exportedToast'));
  }

  async function handleConfirmDelete(): Promise<void> {
    setDel({ kind: 'deleting' });
    const result = await deleteMyAccount();
    if (result.ok) {
      await signOut();
      toast.show(t('settings.deletedToast'));
      navigate('/', { replace: true });
      return;
    }
    if (result.failure.code === 'soleAdmin') {
      setDel({ kind: 'blocked', failure: result.failure });
      return;
    }
    toast.show(errorMessage(t, result.failure.message));
    setDel({ kind: 'idle' });
  }

  return (
    <section
      style={{
        marginTop: 'var(--s-7)',
        padding: 'var(--s-5)',
        border: '1px solid var(--accent-deep)',
        borderRadius: 'var(--r-3)',
        background: 'rgba(155, 78, 49, 0.04)',
      }}
    >
      <h2
        className="mono-meta"
        style={{ margin: 0, fontSize: 12, color: 'var(--accent-deep)' }}
      >
        {t('settings.dangerSection')}
      </h2>
      <p
        style={{
          margin: 'var(--s-2) 0 var(--s-5)',
          fontSize: 13,
          color: 'var(--ink-3)',
          lineHeight: 1.5,
        }}
      >
        {t('settings.dangerSub')}
      </p>

      {/* Export */}
      <div style={{ marginBottom: 'var(--s-5)' }}>
        <h3
          className="display-italic"
          style={{ margin: 0, fontSize: 18, lineHeight: 1.2, color: 'var(--ink)' }}
        >
          {t('settings.exportTitle')}
        </h3>
        <p
          style={{
            margin: 'var(--s-2) 0 var(--s-3)',
            fontSize: 13,
            color: 'var(--ink-2)',
            lineHeight: 1.55,
          }}
        >
          {t('settings.exportSub')}
        </p>
        <Button variant="ghost" disabled={exporting} onClick={() => void handleExport()}>
          {exporting ? t('settings.exporting') : t('settings.exportCta')}
        </Button>
      </div>

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: 'var(--s-4) 0' }} />

      {/* Delete */}
      <div>
        <h3
          className="display-italic"
          style={{ margin: 0, fontSize: 18, lineHeight: 1.2, color: 'var(--accent-deep)' }}
        >
          {t('settings.deleteTitle')}
        </h3>
        <p
          style={{
            margin: 'var(--s-2) 0 var(--s-3)',
            fontSize: 13,
            color: 'var(--ink-2)',
            lineHeight: 1.55,
          }}
        >
          {t('settings.deleteSub')}
        </p>

        {del.kind === 'idle' && (
          <DangerButton onClick={() => setDel({ kind: 'confirming', typed: '' })}>
            {t('settings.deleteCta')}
          </DangerButton>
        )}

        {del.kind === 'confirming' && (
          <DeleteConfirmPanel
            confirmToken={confirmToken}
            typed={del.typed}
            onTypedChange={(typed) => setDel({ kind: 'confirming', typed })}
            onCancel={() => setDel({ kind: 'idle' })}
            onConfirm={() => void handleConfirmDelete()}
          />
        )}

        {del.kind === 'deleting' && (
          <DangerButton disabled>{t('settings.deleting')}</DangerButton>
        )}

        {del.kind === 'blocked' && del.failure.code === 'soleAdmin' && (
          <SoleAdminBlock
            groups={del.failure.groups}
            onDismiss={() => setDel({ kind: 'idle' })}
          />
        )}
      </div>
    </section>
  );
}

interface DeleteConfirmPanelProps {
  confirmToken: string;
  typed: string;
  onTypedChange: (next: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteConfirmPanel({
  confirmToken,
  typed,
  onTypedChange,
  onCancel,
  onConfirm,
}: DeleteConfirmPanelProps) {
  const { t } = useI18n();
  const matches = typed.trim() === confirmToken;

  return (
    <div
      style={{
        padding: 'var(--s-4)',
        background: 'var(--paper)',
        border: '1px solid var(--accent-deep)',
        borderRadius: 'var(--r-2)',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: 'var(--ink)',
          lineHeight: 1.55,
        }}
      >
        {t('settings.deleteConfirm')}
      </p>
      <div style={{ marginTop: 'var(--s-3)' }}>
        <Field label={t('settings.deleteConfirmInputLabel', { token: confirmToken })}>
          <SketchInput
            type="text"
            value={typed}
            onChange={(e) => onTypedChange(e.target.value)}
            autoFocus
            autoComplete="off"
          />
        </Field>
      </div>
      <div style={{ marginTop: 'var(--s-3)', display: 'flex', gap: 'var(--s-2)', justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <DangerButton onClick={onConfirm} disabled={!matches}>
          {t('settings.deleteConfirmFinal')}
        </DangerButton>
      </div>
    </div>
  );
}

interface SoleAdminBlockProps {
  groups: string[];
  onDismiss: () => void;
}

function SoleAdminBlock({ groups, onDismiss }: SoleAdminBlockProps) {
  const { t } = useI18n();
  return (
    <div
      style={{
        padding: 'var(--s-4)',
        background: 'rgba(155, 78, 49, 0.08)',
        border: '1px solid var(--accent-deep)',
        borderRadius: 'var(--r-2)',
      }}
    >
      <h4
        className="display-italic"
        style={{
          margin: 0,
          fontSize: 17,
          lineHeight: 1.2,
          color: 'var(--accent-deep)',
        }}
      >
        {t('settings.deleteSoleAdminTitle')}
      </h4>
      <p
        style={{
          margin: 'var(--s-2) 0 var(--s-3)',
          fontSize: 13,
          color: 'var(--ink-2)',
          lineHeight: 1.55,
        }}
      >
        {t('settings.deleteSoleAdminBody')}
      </p>
      <ul
        style={{
          margin: '0 0 var(--s-3)',
          paddingLeft: 'var(--s-5)',
          fontSize: 14,
          color: 'var(--ink)',
        }}
      >
        {groups.map((g) => (
          <li key={g} style={{ marginBottom: 4 }}>
            <strong>{g}</strong>
          </li>
        ))}
      </ul>
      <Button variant="ghost" onClick={onDismiss}>
        {t('common.cancel')}
      </Button>
    </div>
  );
}

/** Small, plain accent-deep button used only for destructive actions. */
function DangerButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mono-meta"
      style={{
        background: disabled ? 'var(--hair-strong)' : 'var(--accent-deep)',
        border: 'none',
        padding: '9px 16px',
        borderRadius: 'var(--r-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: 'var(--paper)',
        fontWeight: 600,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {children}
    </button>
  );
}
