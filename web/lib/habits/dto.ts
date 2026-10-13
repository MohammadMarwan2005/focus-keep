import type { EntryStatus, GoalVersion, ProgressType } from "./types";

/** Plain, serialisable shapes passed from server components/actions to the client. */

export type IconFields = {
  icon_type: "emoji" | "image" | "svg";
  emoji: string | null;
  image_path: string | null;
  bg_color: string | null;
  fg_color: string | null;
};

export type HabitDTO = IconFields & {
  id: number;
  title: string;
  description: string | null;
  line_dirs: string | null;
  progress_type: ProgressType;
  unit: string | null;
  reminder_enabled: boolean;
  start_date: string;
  archived: boolean;
  position: number;
  goals: GoalVersion[];
  /** progress_type is locked once true. */
  hasEntries: boolean;
};

export type EntryDTO = {
  id: number;
  habit_id: number;
  day: string;
  status: EntryStatus;
  value: number | null;
  notes: string | null;
  line_dirs: string | null;
  mistakeIds: number[];
};

export type MistakeDTO = {
  id: number;
  habit_id: number;
  text: string;
  line_dirs: string | null;
  suggest: boolean;
  usage_count: number;
  /** ISO timestamp (UTC). */
  created_at: string;
};

export type BoardHabit = HabitDTO & { entry: EntryDTO | null };

export type CatchUpBlock = { habit: HabitDTO; days: string[] };

export type HabitInput = {
  title: string;
  description: string | null;
  line_dirs: string | null;
  icon_type: "emoji" | "image" | "svg";
  emoji: string | null;
  image_path: string | null;
  bg_color: string | null;
  fg_color: string | null;
  progress_type: ProgressType;
  unit: string | null;
  goal_value: number | string | null;
  goal_direction: "at_least" | "at_most";
  reminder_enabled: boolean;
  start_date: string;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
