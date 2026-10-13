// Domain types for the pure habit logic. Kept free of DB / React imports so
// everything under lib/habits/ runs in `tsx --test`.

export type ProgressType = "boolean" | "measured";
export type GoalDirection = "at_least" | "at_most";
export type EntryStatus = "done" | "missed" | "skipped";

/**
 * Derived state of one (habit, day). `unknown` = no record; it is never
 * counted as a failure anywhere. `skipped` is neutral everywhere.
 */
export type Outcome = "success" | "failure" | "skipped" | "unknown";

export type GoalVersion = {
  goal_value: number;
  goal_direction: GoalDirection;
  /** YYYY-MM-DD; the version applies from this day until a later version starts. */
  effective_from: string;
};

export type EntryLike = {
  status: EntryStatus;
  value: number | null;
};

export type Evaluation = {
  outcome: Outcome;
  /** 0..1 for success/failure (1 = goal met); null for skipped/unknown. */
  closeness: number | null;
};
