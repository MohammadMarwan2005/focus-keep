"use client";

import { ICON_MAX_PX, MAX_IMAGE_BYTES } from "@/lib/habits/files";

/**
 * Shrink a picked image to fit ICON_MAX_PX on its longest side, in the
 * browser (the server box is too RAM-limited for sharp). Prefers WebP, falls
 * back to PNG where the browser can't encode WebP, and steps quality down
 * until the result fits the upload limit.
 */
export async function resizeIcon(file: File): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, ICON_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  for (const q of [0.9, 0.75, 0.6, 0.45]) {
    const webp = await toBlob(canvas, "image/webp", q);
    if (webp && webp.type === "image/webp") {
      if (webp.size <= MAX_IMAGE_BYTES) return webp;
      continue;
    }
    // no WebP encoder (older Safari): PNG once, then JPEG at decreasing quality
    const png = await toBlob(canvas, "image/png");
    if (png && png.size <= MAX_IMAGE_BYTES) return png;
    const jpg = await toBlob(canvas, "image/jpeg", q);
    if (jpg && jpg.size <= MAX_IMAGE_BYTES) return jpg;
  }
  throw new Error("too large");
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
