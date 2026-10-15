import { resolveGoal } from "./goals";
import { evaluateEntry } from "./evaluate";
import type { EntryDTO, HabitDTO } from "./dto";
import type { Evaluation } from "./types";

/** Outcome of a habit on a day, given its (possibly missing) entry. */
export function evaluateDay(h: Pick<HabitDTO, "progress_type" | "goals">, entry: Pick<EntryDTO, "status" | "value"> | null, day: string): Evaluation {
  return evaluateEntry(h.progress_type, entry, resolveGoal(h.goals, day));
}

/** Cookie holding the board rail's open/collapsed state; read server-side to avoid a flash. */
export const HABITS_RAIL_COOKIE = "habits_rail";

/** "7.5" rather than "7.50"; keeps up to two decimals. */
export const fmtNum = (n: number) => String(Number(n.toFixed(2)));

/** Tailwind classes per outcome, shared by the rail and the catch-up rows. */
export const OUTCOME_STYLE = {
  success: "bg-q-schedule-bg border-q-schedule-ink/40",
  failure: "bg-q-do-bg border-q-do-ink/40",
  skipped: "bg-surface border-line border-dashed opacity-75",
  unknown: "bg-surface border-line",
} as const;

export const OUTCOME_LABEL = {
  success: "تم",
  failure: "لم يتحقق",
  skipped: "متخطّى",
  unknown: "غير مسجّل",
} as const;
