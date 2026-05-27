/**
 * `<PhotoField>` — file picker + live preview used inside `<ItemForm>`.
 *
 * On pick, the file is handed to `<ImageCropDialog>` (4:3, free crop)
 * so users can frame the photo before upload. The resulting JPEG is
 * then sent through the existing `uploadItemImage` path.
 *
 * The component is dumb about the surrounding form: it just exposes
 * `value` (current cover URL or null) and an `onChange` callback. The
 * parent decides what to do with the URL — usually pass it through to
 * the item insert/update.
 */
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import { useI18n } from '../../i18n/useI18n';
import { uploadItemImage } from '../../items/uploadItemImage';
import { errorMessage } from '../../lib/errors';
import { ItemPhoto } from '../../components/ItemPhoto';
import { Button } from '../../components/Button';
import { ImageCropDialog } from '../../components/ImageCropDialog';

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
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  // Release the object URL once the dialog closes so we don't leak memory.
  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  function openPicker(): void {
    inputRef.current?.click();
  }

  function handlePicked(file: File): void {
    setError(null);
    setCropSrc(URL.createObjectURL(file));
  }

  async function handleCropSave(file: File): Promise<void> {
    if (!user) return;
    setCropSrc(null);
    setUploading(true);
    const result = await uploadItemImage(file, user.id);
    setUploading(false);
    if ('error' in result) {
      setError(errorMessage(t, result.error));
      return;
    }
    onChange(result.url);
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
          if (f) handlePicked(f);
        }}
      />

      {cropSrc && (
        <ImageCropDialog
          open
          imageSrc={cropSrc}
          aspect={4 / 3}
          cropShape="rect"
          outputMaxDim={1200}
          filename="cover.jpg"
          onCancel={() => setCropSrc(null)}
          onSave={(file) => void handleCropSave(file)}
        />
      )}
    </div>
  );
}
