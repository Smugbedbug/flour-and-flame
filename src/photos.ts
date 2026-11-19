// Recipe photo handling: your own photos only, compressed and kept on this device.

export const PHOTO_MAX_SIDE = 1600;
export const THUMB_MAX_SIDE = 360;

async function loadBitmap(file: Blob): Promise<{ img: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { img: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { img, width: img.naturalWidth, height: img.naturalHeight };
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

function draw(src: CanvasImageSource, w: number, h: number, max: number, quality: number): { url: string; width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  const width = Math.max(1, Math.round(w * scale)), height = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('This browser cannot process images.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, width, height);
  return { url: canvas.toDataURL('image/jpeg', quality), width, height };
}

/** Resize to ≤1600 px (JPEG 82%) plus a ≤360 px thumbnail. Typical phone photo: 3–6 MB → ~200–400 KB. */
export async function compressPhoto(file: Blob): Promise<{ dataUrl: string; thumbUrl: string; width: number; height: number }> {
  if (!file.type.startsWith('image/')) throw Error('Please choose an image file.');
  const b = await loadBitmap(file);
  try {
    const full = draw(b.img, b.width, b.height, PHOTO_MAX_SIDE, 0.82);
    const thumb = draw(b.img, b.width, b.height, THUMB_MAX_SIDE, 0.72);
    return { dataUrl: full.url, thumbUrl: thumb.url, width: full.width, height: full.height };
  } finally { b.close?.(); }
}

/** Small square picture for the customer order form, kept under ~40,000 characters so it fits in one Google Sheet cell. */
export async function menuPicture(file: Blob): Promise<string> {
  if (!file.type.startsWith('image/')) throw Error('Please choose an image file.');
  const b = await loadBitmap(file);
  try {
    const side = Math.min(b.width, b.height), sx = (b.width - side) / 2, sy = (b.height - side) / 2;
    for (const [px, q] of [[360, 0.78], [320, 0.7], [280, 0.62], [240, 0.55], [200, 0.5]] as const) {
      const canvas = document.createElement('canvas');
      canvas.width = px; canvas.height = px;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('This browser cannot process images.');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(b.img, sx, sy, side, side, 0, 0, px, px);
      const url = canvas.toDataURL('image/jpeg', q);
      if (url.length <= 40000) return url;
    }
    throw Error('That picture is too detailed to shrink enough. Try a simpler image.');
  } finally { b.close?.(); }
}
