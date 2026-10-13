/**
 * Upload checks for habit icons. Pure (no fs), so the route handler and the
 * tests share them.
 */

export const MAX_IMAGE_BYTES = 300 * 1024;
export const MAX_SVG_BYTES = 100 * 1024;
export const ICON_MAX_PX = 256;

export type RasterKind = "png" | "jpg" | "webp";

/** Identify a raster image by its magic bytes; the browser-reported MIME is not trusted. */
export function sniffImage(b: Uint8Array): RasterKind | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 12
    && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 // RIFF
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp"; // WEBP
  return null;
}

/**
 * Reject SVGs that could run code or pull in outside resources. Uploaded SVG
 * is only ever used as a CSS mask and served sandboxed, but it is still
 * screened here. Returns an Arabic error, or null when acceptable.
 */
export function checkSvg(text: string, byteLength: number): string | null {
  if (byteLength > MAX_SVG_BYTES) return "ملف SVG كبير جداً (الحد ١٠٠ كيلوبايت)";
  if (!/<svg[\s>]/i.test(text)) return "الملف ليس SVG صالحاً";
  if (/<script/i.test(text)) return "ملف SVG يحتوي على سكربت";
  if (/<foreignObject/i.test(text)) return "ملف SVG يحتوي على عناصر غير مسموحة";
  // <a>/<set>/<animate*> can rewrite href to a script URL; icons don't need them
  if (/<(iframe|embed|object|audio|video|a|set|animate\w*|handler|listener)[\s/>]/i.test(text)) return "ملف SVG يحتوي على عناصر غير مسموحة";
  // character references could hide "javascript:" or a handler name from the checks below
  if (/&#|&(?!(amp|lt|gt|quot|apos);)\w+;/i.test(text)) return "ملف SVG يحتوي على ترميز غير مسموح";
  if (/<!(DOCTYPE|ENTITY)/i.test(text)) return "ملف SVG يحتوي على تعريفات غير مسموحة";
  // event handler attributes: onload=, onclick= … (preceded by whitespace, / or a quote)
  // also namespaced ones like x:onload=
  if (/[\s/"':]on[a-z]+\s*=/i.test(text)) return "ملف SVG يحتوي على أحداث غير مسموحة";
  if (/javascript:/i.test(text)) return "ملف SVG يحتوي على روابط غير مسموحة";
  // href / xlink:href must point inside the document (#id)
  for (const m of text.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gis)) {
    if (!m[2].trim().startsWith("#")) return "ملف SVG يشير إلى موارد خارجية";
  }
  if (/(?:xlink:)?href\s*=\s*[^"'\s>]/i.test(text)) return "ملف SVG يشير إلى موارد خارجية";
  // url(...) in attributes or <style> must be a local fragment
  for (const m of text.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gis)) {
    if (!m[2].trim().startsWith("#")) return "ملف SVG يشير إلى موارد خارجية";
  }
  if (/@import/i.test(text)) return "ملف SVG يشير إلى موارد خارجية";
  return null;
}

/** At most this many icon files per user; unreferenced ones are swept on upload. */
export const MAX_ICON_FILES = 60;
/** An unreferenced upload younger than this may still be in an open, unsaved form. */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/** Stored icon files are random hex names under habits/<uid>/. */
export const ICON_FILE_RE = /^[a-f0-9]{24}\.(png|jpg|webp|svg)$/;

/** The relative path an icon of this user may reference (null if it isn't one). */
export function ownedIconPath(uid: number, rel: unknown, kind: "image" | "svg"): string | null {
  if (typeof rel !== "string") return null;
  const prefix = `habits/${uid}/`;
  if (!rel.startsWith(prefix)) return null;
  const name = rel.slice(prefix.length);
  if (!ICON_FILE_RE.test(name)) return null;
  const isSvg = name.endsWith(".svg");
  return (kind === "svg") === isSvg ? rel : null;
}

/** Public URL of a stored icon (served by app/api/habits/icon/[file]). */
export function iconUrl(rel: string | null | undefined): string | null {
  if (!rel) return null;
  const name = rel.split("/").pop() ?? "";
  return ICON_FILE_RE.test(name) ? `/api/habits/icon/${name}` : null;
}
