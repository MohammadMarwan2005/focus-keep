/**
 * Text normalisation for the mistake catalog, so free text that "exactly
 * matches" an existing row reuses it instead of creating a near-duplicate.
 */

/** Display form: Unicode-normalised, inner whitespace collapsed, trimmed. */
export function normalizeMistakeText(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Comparison key: the display form, case-folded (Arabic has no case; Latin does). */
export function mistakeKey(s: string): string {
  return normalizeMistakeText(s).toLowerCase();
}

/** The catalog row whose text matches `text` after normalisation, if any. */
export function findMatchingMistake<T extends { text: string }>(rows: readonly T[], text: string): T | undefined {
  const key = mistakeKey(text);
  if (!key) return undefined;
  return rows.find((r) => mistakeKey(r.text) === key);
}

export type Suggestible = { id: number; suggest: boolean; usage_count: number; created_at: string | number };

/**
 * Chips shown under an entry: rows with suggest = true, most used first, then
 * most recent (created_at as ISO string or epoch), then id for stability.
 */
export function sortSuggestions<T extends Suggestible>(rows: readonly T[]): T[] {
  return rows
    .filter((r) => r.suggest)
    .sort((a, b) =>
      b.usage_count - a.usage_count
      || cmpRecency(b.created_at, a.created_at)
      || b.id - a.id,
    );
}

function cmpRecency(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

/** Search the whole catalog (including suggest = false rows) by substring, case-insensitive. */
export function searchMistakes<T extends { text: string }>(rows: readonly T[], query: string): T[] {
  const q = mistakeKey(query);
  if (!q) return [];
  return rows.filter((r) => mistakeKey(r.text).includes(q));
}
