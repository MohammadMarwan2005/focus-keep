import type { GoalVersion } from "./types";

/**
 * The goal in effect on `day`: the version with the latest effective_from
 * <= day. Null when no version applies yet (or the habit is boolean).
 * ISO date strings compare correctly as plain strings.
 */
export function resolveGoal(goals: readonly GoalVersion[], day: string): GoalVersion | null {
  let best: GoalVersion | null = null;
  for (const g of goals) {
    if (g.effective_from <= day && (!best || g.effective_from > best.effective_from)) best = g;
  }
  return best;
}

/** Goal value per day, stepping where a new version starts (for the chart's goal line). */
export function goalSeries(goals: readonly GoalVersion[], days: readonly string[]): (number | null)[] {
  return days.map((d) => resolveGoal(goals, d)?.goal_value ?? null);
}
