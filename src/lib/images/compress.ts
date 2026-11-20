"use client";

import imageCompression from "browser-image-compression";

export type ProcessedPhoto = {
  id: string;
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  /** Object URL of the thumbnail, for previews in the form. */
  previewUrl: string;
};

async function dimensions(blob: Blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return { width: 1600, height: 1200 };
  }
}

/**
 * Shrinks a phone photo before upload: max 1600px at ~80% JPEG quality
 * (usually 250–600 KB instead of 3–8 MB), plus a 480px thumbnail for fast lists.
 * Runs in a background worker so the screen stays responsive.
 */
export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  // The worker script is served by this app (not a CDN) so compression also works offline.
  const common = { useWebWorker: true, libURL: "/vendor/browser-image-compression-2.0.2.js", fileType: "image/jpeg", preserveExif: false } as const;
  const full = await imageCompression(file, { ...common, maxWidthOrHeight: 1600, initialQuality: 0.8, maxSizeMB: 1.2 });
  const thumb = await imageCompression(full, { ...common, maxWidthOrHeight: 480, initialQuality: 0.7, maxSizeMB: 0.15 });
  const { width, height } = await dimensions(full);
  return { id: crypto.randomUUID(), full, thumb, width, height, previewUrl: URL.createObjectURL(thumb) };
}
