/**
 * Per-line text direction, stored exactly like ideas.line_dirs / tasks.line_dirs:
 * JSON {"<lineIndex>": "ltr" | "rtl"}. Lines absent from the map auto-align by
 * their first strong character (dir="auto").
 */

export type Dir = "ltr" | "rtl";
export type LineDirs = Record<string, Dir>;
export type BidiContent = { text: string; lineDirs: LineDirs };

export function parseLineDirs(json: string | null | undefined): LineDirs {
  if (!json) return {};
  try {
    const o = JSON.parse(json);
    const out: LineDirs = {};
    if (o && typeof o === "object") {
      for (const k of Object.keys(o)) if (/^\d+$/.test(k) && (o[k] === "ltr" || o[k] === "rtl")) out[k] = o[k];
    }
    return out;
  } catch {
    return {};
  }
}

export const serializeLineDirs = (m: LineDirs): string | null => (Object.keys(m).length ? JSON.stringify(m) : null);

/** Re-parse untrusted input and drop entries for lines that don't exist. */
export function sanitizeLineDirs(json: unknown, text: string | null): string | null {
  if (typeof json !== "string" || !text) return null;
  const lines = text.split("\n").length;
  const m = parseLineDirs(json);
  for (const k of Object.keys(m)) if (Number(k) >= lines) delete m[k];
  return serializeLineDirs(m);
}

export const contentOf = (text: string | null | undefined, lineDirs: string | null | undefined): BidiContent => ({
  text: text ?? "",
  lineDirs: parseLineDirs(lineDirs),
});
