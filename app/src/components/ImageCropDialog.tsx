/**
 * `<ImageCropDialog>` — modal wrapper around `react-easy-crop`.
 * Used by `<AvatarPanel>` (round crop, 1:1, 512px output) and
 * `<PhotoField>` (free crop, 4:3 default, 1200px output).
 *
 * Props are intentionally minimal — caller hands in a source URL
 * (`URL.createObjectURL(file)`) and gets a resolved JPEG `File` back
 * via `onSave`. The dialog owns its own crop/zoom state.
 */
import { useCallback, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { useI18n } from '../i18n/useI18n';
import { useFocusTrap } from '../lib/useFocusTrap';
import { cropImage, type CropPixels } from '../lib/cropImage';

interface ImageCropDialogProps {
  open: boolean;
  /** Object URL or data URL of the picked file. */
  imageSrc: string;
  /** Crop aspect ratio. `1` for avatars, `4/3` for item covers. */
  aspect?: number;
  /** Crop frame shape — circular preview for avatars. */
  cropShape?: 'rect' | 'round';
  /** Long edge of the output (px). Default 1200. */
  outputMaxDim?: number;
  /** Filename for the resulting `File` (extension forced to `.jpg`). */
  filename?: string;
  onCancel: () => void;
  onSave: (file: File) => void;
}

export function ImageCropDialog({
  open,
  imageSrc,
  aspect = 1,
  cropShape = 'rect',
  outputMaxDim = 1200,
  filename = 'cropped.jpg',
  onCancel,
  onSave,
}: ImageCropDialogProps) {
  const { t } = useI18n();
  const cardRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(cardRef);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<CropPixels | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCropComplete = useCallback((_: Area, area: Area) => {
    setAreaPixels({ x: area.x, y: area.y, width: area.width, height: area.height });
  }, []);

  async function handleSave() {
    if (!areaPixels) return;
    setSaving(true);
    try {
      const file = await cropImage(imageSrc, areaPixels, outputMaxDim, filename);
      onSave(file);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('cropDialog.title')}
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(43, 38, 32, 0.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--s-4)',
        zIndex: 1100,
        animation: 'fadeIn var(--motion) ease-out',
      }}
    >
      <div
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        className="fade-up"
        style={{
          width: 'min(520px, 100%)',
          background: 'var(--paper)',
          border: '1px solid var(--hair-strong)',
          padding: 'var(--s-5)',
          borderRadius: 'var(--r-3)',
          boxShadow: '0 16px 40px rgba(43, 38, 32, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-4)',
        }}
      >
        <h2
          className="display-italic"
          style={{
            margin: 0,
            fontSize: 'var(--display-s)',
            lineHeight: 1.15,
            letterSpacing: -0.5,
            color: 'var(--ink)',
          }}
        >
          {t('cropDialog.title')}
        </h2>

        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 360,
            background: 'var(--ink)',
            borderRadius: 'var(--r-2)',
            overflow: 'hidden',
          }}
        >
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
            showGrid={cropShape === 'rect'}
            objectFit="contain"
          />
        </div>

        <label
          className="mono-meta"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', color: 'var(--ink-3)' }}
        >
          {t('cropDialog.zoom')}
          <input
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ flex: 1 }}
            aria-label={t('cropDialog.zoom')}
          />
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-3)' }}>
          <button
            type="button"
            onClick={onCancel}
            className="mono-meta"
            style={{
              background: 'transparent',
              border: '1px solid var(--hair-strong)',
              padding: '8px 14px',
              borderRadius: 'var(--r-2)',
              color: 'var(--ink-2)',
              cursor: 'pointer',
            }}
          >
            {t('cropDialog.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !areaPixels}
            className="mono-meta"
            style={{
              background: 'var(--accent)',
              border: '1px solid var(--accent)',
              padding: '8px 14px',
              borderRadius: 'var(--r-2)',
              color: 'var(--paper)',
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving || !areaPixels ? 0.6 : 1,
            }}
          >
            {saving ? t('cropDialog.saving') : t('cropDialog.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
