import { addDaysISO, weekdayIndexISO } from "@/lib/date";
import type { Outcome } from "./types";

/** Every day from `from` to `to` inclusive (empty when from > to). */
export function eachDayISO(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysISO(d, 1)) out.push(d);
  return out;
}

/** success / (success + failure) over recorded days only; null when nothing recorded. */
export function successRate(outcomes: Iterable<Outcome>): number | null {
  let ok = 0;
  let n = 0;
  for (const o of outcomes) {
    if (o === "success") { ok++; n++; }
    else if (o === "failure") n++;
  }
  return n ? ok / n : null;
}

export function averageValue(values: Iterable<number | null | undefined>): number | null {
  let sum = 0;
  let n = 0;
  for (const v of values) if (v != null) { sum += v; n++; }
  return n ? sum / n : null;
}

/**
 * Trailing average over the last `window` positions, ignoring nulls; null
 * when no value in the window. Positions are days (one per day, in order).
 */
export function rollingAverage(values: readonly (number | null)[], window = 7): (number | null)[] {
  return values.map((_, i) => averageValue(values.slice(Math.max(0, i - window + 1), i + 1)));
}

export type WeekdayStat = { weekday: number; rate: number | null; recorded: number };

/** Success rate per weekday (index 0 = Sunday .. 6 = Saturday) over recorded days. */
export function weekdayBreakdown(days: readonly { day: string; outcome: Outcome }[]): WeekdayStat[] {
  const buckets: Outcome[][] = Array.from({ length: 7 }, () => []);
  for (const d of days) buckets[weekdayIndexISO(d.day)].push(d.outcome);
  return buckets.map((b, weekday) => ({
    weekday,
    rate: successRate(b),
    recorded: b.filter((o) => o === "success" || o === "failure").length,
  }));
}

/* ------------------------------- heatmap -------------------------------- */

export type HeatLevel = "success" | "partial" | "failure" | "skipped" | "unknown";
export type HeatCell = { day: string; outcome: Outcome; closeness: number | null; level: HeatLevel };

/** A miss this close to the goal (by closeness) is shown as partial rather than failure. */
export const PARTIAL_THRESHOLD = 0.75;

export function heatLevel(outcome: Outcome, closeness: number | null): HeatLevel {
  if (outcome === "failure") return closeness != null && closeness >= PARTIAL_THRESHOLD ? "partial" : "failure";
  return outcome;
}

/** First day of the month `months - 1` months before today's month, through today. */
export function heatmapRange(today: string, months = 3): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const total = y * 12 + (m - 1) - (months - 1);
  const fy = Math.floor(total / 12);
  const fm = (total % 12) + 1;
  return { from: `${fy}-${String(fm).padStart(2, "0")}-01`, to: today };
}

/** Saturday-first week, the usual Arabic calendar layout. */
export const WEEK_ORDER: readonly number[] = [6, 0, 1, 2, 3, 4, 5];

/**
 * Lay the range out as columns of 7 cells (one column per week, rows in
 * WEEK_ORDER). Cells outside [from, to] are null so the grid stays aligned.
 */
export function buildHeatmap(
  cells: Readonly<Record<string, { outcome: Outcome; closeness: number | null }>>,
  from: string,
  to: string,
  weekOrder: readonly number[] = WEEK_ORDER,
): (HeatCell | null)[][] {
  const rowOf = new Map(weekOrder.map((w, i) => [w, i]));
  const weeks: (HeatCell | null)[][] = [];
  let col: (HeatCell | null)[] | null = null;
  for (const day of eachDayISO(from, to)) {
    const row = rowOf.get(weekdayIndexISO(day)) ?? 0;
    if (!col || row === 0) {
      col = Array<HeatCell | null>(7).fill(null);
      weeks.push(col);
    }
    const c = cells[day];
    const outcome = c?.outcome ?? "unknown";
    const closeness = c?.closeness ?? null;
    col[row] = { day, outcome, closeness, level: heatLevel(outcome, closeness) };
  }
  return weeks;
}
