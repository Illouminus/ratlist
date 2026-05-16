/**
 * `<PhotoField>` — file picker + live preview used inside `<ItemDrawer>`.
 *
 * The component is dumb about the surrounding form: it just exposes
 * `value` (current cover URL or null) and an `onChange` callback. The
 * parent decides what to do with the URL — usually pass it through to
 * the item insert/update.
 *
 * Hidden `<input type="file">` paired with a labelled button keeps the
 * editorial aesthetic (no native file-chooser styling leaks through).
 */
import { useRef, useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import { useI18n } from '../../i18n/useI18n';
import { uploadItemImage } from '../../items/uploadItemImage';
import { errorMessage } from '../../lib/errors';
import { ItemPhoto } from '../../components/ItemPhoto';
import { Button } from '../../components/Button';

interface PhotoFieldProps {
  value: string | null;
  onChange: (next: string | null) => void;
}

export function PhotoField({ value, onChange }: PhotoFieldProps) {
  const { user } = useAuth();
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File): Promise<void> {
    if (!user) return;
    setUploading(true);
    setError(null);
    const result = await uploadItemImage(file, user.id);
    setUploading(false);
    if ('error' in result) {
      setError(errorMessage(t, result.error));
      return;
    }
    onChange(result.url);
  }

  function openPicker(): void {
    inputRef.current?.click();
  }

  return (
    <div style={{ marginBottom: 'var(--s-5)' }}>
      <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
        {t('add.photoLabel')}
      </div>

      <div style={{ display: 'flex', gap: 'var(--s-4)', alignItems: 'flex-start' }}>
        <div style={{ width: 120, flexShrink: 0 }}>
          <ItemPhoto coverUrl={value} aspectRatio="4 / 3" alt="" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          <Button
            variant="ghost"
            onClick={openPicker}
            disabled={uploading}
            style={{ color: 'var(--accent)', padding: 0 }}
          >
            {uploading
              ? t('photo.uploading')
              : value
                ? t('photo.replace')
                : t('photo.add')}
          </Button>
          {value && !uploading && (
            <Button
              variant="ghost"
              onClick={() => onChange(null)}
              style={{ color: 'var(--ink-3)', padding: 0 }}
            >
              {t('photo.remove')}
            </Button>
          )}
          {error && (
            <p style={{ color: 'var(--accent-deep)', fontSize: 12, margin: 0 }}>{error}</p>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          // Allow re-selecting the same file by clearing the value after read.
          e.target.value = '';
          if (f) void handleFile(f);
        }}
      />
    </div>
  );
}
