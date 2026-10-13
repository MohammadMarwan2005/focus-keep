import { addDaysISO } from "@/lib/date";

/** The catch-up sheet never asks beyond this many days back. */
export const CATCH_UP_WINDOW = 14;

/**
 * Days the catch-up sheet should ask about for one habit: yesterday back to
 * yesterday minus (windowDays - 1), skipping days before start_date and days
 * that already have an entry. Today is never included. Newest first.
 */
export function catchUpDays(opts: {
  today: string;
  startDate: string;
  entryDays: Iterable<string>;
  windowDays?: number;
}): string[] {
  const { today, startDate, windowDays = CATCH_UP_WINDOW } = opts;
  const have = opts.entryDays instanceof Set ? opts.entryDays : new Set(opts.entryDays);
  const out: string[] = [];
  for (let i = 1; i <= windowDays; i++) {
    const d = addDaysISO(today, -i);
    if (d < startDate) break; // everything older is before the habit started
    if (!have.has(d)) out.push(d);
  }
  return out;
}
