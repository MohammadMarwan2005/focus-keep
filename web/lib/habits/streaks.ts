import { addDaysISO } from "@/lib/date";
import type { Outcome } from "./types";

export type Streaks = { current: number; best: number };

/**
 * Streak = consecutive days with success. Skipped days are transparent
 * (neither count nor break); unknown and failure days break a streak.
 *
 * `outcomes` maps YYYY-MM-DD -> outcome; days absent are unknown. The range is
 * [from, to] inclusive, normally start_date .. today. `to` itself (today) is
 * still in progress, so when it has no record it is transparent for the
 * current streak instead of breaking it.
 */
export function computeStreaks(outcomes: Readonly<Record<string, Outcome>>, from: string, to: string): Streaks {
  if (from > to) return { current: 0, best: 0 };

  let best = 0;
  let run = 0;
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    const o = outcomes[d] ?? "unknown";
    if (o === "success") {
      run++;
      if (run > best) best = run;
    } else if (o !== "skipped") {
      run = 0;
    }
  }

  let current = 0;
  let d = to;
  if ((outcomes[d] ?? "unknown") === "unknown") d = addDaysISO(d, -1);
  for (; d >= from; d = addDaysISO(d, -1)) {
    const o = outcomes[d] ?? "unknown";
    if (o === "success") current++;
    else if (o !== "skipped") break;
  }

  return { current, best };
}
