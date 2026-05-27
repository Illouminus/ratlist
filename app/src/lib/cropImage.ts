/**
 * Crop + resize a source image to a JPEG `File`, using crop coordinates
 * returned by `react-easy-crop` (`{ x, y, width, height }` in source-image
 * pixel space).
 *
 * Output size is bounded by `maxDim` on the long edge — keeps avatar
 * uploads ~50 KB and item-cover uploads under the 8 MB bucket limit even
 * when the source is a 10 MP iPhone photo. Quality is fixed at 0.85
 * (visually indistinguishable for our use cases, ~3× smaller than 0.95).
 */

export interface CropPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function cropImage(
  imageSrc: string,
  crop: CropPixels,
  maxDim: number,
  filename: string,
): Promise<File> {
  const img = await loadImage(imageSrc);

  const scale = Math.min(1, maxDim / Math.max(crop.width, crop.height));
  const w = Math.max(1, Math.round(crop.width * scale));
  const h = Math.max(1, Math.round(crop.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unsupported');

  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85);
  });
  if (!blob) throw new Error('blob_failed');

  return new File([blob], filename, { type: 'image/jpeg' });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_load_failed'));
    // Cross-origin is fine for blob: / data: URLs; for http we'd need
    // CORS headers on the source — not a concern here since the cropper
    // is always handed a fresh `URL.createObjectURL(file)`.
    img.src = src;
  });
}
