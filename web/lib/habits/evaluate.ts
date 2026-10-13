import type { EntryLike, Evaluation, GoalVersion, ProgressType } from "./types";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * How close a measured value came to its goal, 0..1 (1 = met).
 *   at_least -> clamp(value / goal, 0, 1)
 *   at_most  -> 1 if value <= goal, else goal / value
 */
export function closeness(value: number, goal: GoalVersion): number {
  if (goal.goal_value <= 0) return value > 0 ? 1 : 0; // defensive; goals are validated > 0
  if (goal.goal_direction === "at_least") return clamp01(value / goal.goal_value);
  return value <= goal.goal_value ? 1 : clamp01(goal.goal_value / value);
}

/**
 * Derive the outcome of one day. Success is never stored.
 * - no entry            -> unknown
 * - status skipped      -> skipped
 * - boolean             -> done = success, missed = failure
 * - measured + value    -> compared with the goal in effect that day
 * - measured, no value  -> missed = failure (nothing achieved), done = unknown (nothing to evaluate)
 */
export function evaluateEntry(
  progressType: ProgressType,
  entry: EntryLike | null | undefined,
  goal: GoalVersion | null,
): Evaluation {
  if (!entry) return { outcome: "unknown", closeness: null };
  if (entry.status === "skipped") return { outcome: "skipped", closeness: null };

  if (progressType === "boolean") {
    return entry.status === "done"
      ? { outcome: "success", closeness: 1 }
      : { outcome: "failure", closeness: 0 };
  }

  if (entry.value == null) {
    return entry.status === "missed"
      ? { outcome: "failure", closeness: 0 }
      : { outcome: "unknown", closeness: null };
  }
  if (!goal) return { outcome: "unknown", closeness: null };

  const met = goal.goal_direction === "at_least"
    ? entry.value >= goal.goal_value
    : entry.value <= goal.goal_value;
  return { outcome: met ? "success" : "failure", closeness: met ? 1 : closeness(entry.value, goal) };
}
