import {
  mysqlTable, int, varchar, text, boolean, datetime, date, mysqlEnum,
  timestamp, index, uniqueIndex, primaryKey, decimal,
} from "drizzle-orm/mysql-core";

/** The four Eisenhower quadrants. */
export const QUADRANTS = [
  "urgent_important", // عاجل ومهم — Do
  "important",        // مهم غير عاجل — Schedule
  "urgent",           // عاجل غير مهم — Delegate
  "neither",          // لا مهم ولا عاجل — Delete
] as const;
export type Quadrant = (typeof QUADRANTS)[number];

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  password_hash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  role: mysqlEnum("role", ["admin", "user"]).notNull().default("user"),
  // IANA zone (e.g. "Asia/Damascus"). Habit days are calendar dates in this zone;
  // set from the browser on login when empty, editable in settings.
  timezone: varchar("timezone", { length: 64 }),
  created_at: timestamp("created_at").defaultNow(),
});

export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  user_id: int("user_id").notNull(),
  day: date("day", { mode: "string" }).notNull(),
  quadrant: mysqlEnum("quadrant", QUADRANTS).notNull().default("urgent_important"),
  title: varchar("title", { length: 512 }).notNull(),
  note: text("note"),
  // Per-line forced writing direction for the notepad (JSON), mirrors ideas.line_dirs.
  line_dirs: text("line_dirs"),
  done: boolean("done").notNull().default(false),
  done_at: datetime("done_at"),
  position: int("position").notNull().default(0),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (t) => [
  index("idx_user_day").on(t.user_id, t.day),
]);

export const ideas = mysqlTable("ideas", {
  id: int("id").autoincrement().primaryKey(),
  user_id: int("user_id").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  note: text("note"),
  // Per-line forced writing direction for the notepad, as JSON {"<lineIndex>":"ltr"|"rtl"}.
  // Lines absent from this map auto-align by their first strong character.
  line_dirs: text("line_dirs"),
  // Archived notes are hidden from the inbox and the notepad list; they live on /archived.
  archived: boolean("archived").notNull().default(false),
  position: int("position").notNull().default(0),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (t) => [
  index("idx_idea_user").on(t.user_id),
]);

export const settings = mysqlTable("settings", {
  k: varchar("k", { length: 64 }).primaryKey(),
  v: text("v"),
});

/* ------------------------------- habits -------------------------------- */
// Created by scripts/migrate-habits.mjs (not drizzle-kit push). Keep the DDL
// there in sync with these definitions.

export const PROGRESS_TYPES = ["boolean", "measured"] as const;
export type ProgressType = (typeof PROGRESS_TYPES)[number];
export const ICON_TYPES = ["emoji", "image", "svg"] as const;
export type IconType = (typeof ICON_TYPES)[number];
export const GOAL_DIRECTIONS = ["at_least", "at_most"] as const;
export type GoalDirection = (typeof GOAL_DIRECTIONS)[number];
export const ENTRY_STATUSES = ["done", "missed", "skipped"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const habits = mysqlTable("habits", {
  id: int("id").autoincrement().primaryKey(),
  user_id: int("user_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  // Per-line forced writing direction for the description, same JSON shape as ideas.line_dirs.
  line_dirs: text("line_dirs"),
  icon_type: mysqlEnum("icon_type", ICON_TYPES).notNull().default("emoji"),
  emoji: varchar("emoji", { length: 16 }),
  // Relative to DATA_DIR, e.g. "habits/<uid>/a1b2.png" (image or svg).
  image_path: varchar("image_path", { length: 255 }),
  bg_color: varchar("bg_color", { length: 16 }),
  fg_color: varchar("fg_color", { length: 16 }),
  // Locked once the habit has any entry.
  progress_type: mysqlEnum("progress_type", PROGRESS_TYPES).notNull().default("boolean"),
  unit: varchar("unit", { length: 32 }),
  reminder_enabled: boolean("reminder_enabled").notNull().default(true),
  start_date: date("start_date", { mode: "string" }).notNull(),
  // Soft delete, same pattern as ideas.archived.
  archived: boolean("archived").notNull().default(false),
  position: int("position").notNull().default(0),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (t) => [
  index("idx_habit_user_archived").on(t.user_id, t.archived),
]);

// A measured habit's goal is versioned: the row with the latest effective_from
// <= day applies to that day. Changing the goal inserts a new row.
export const habit_goals = mysqlTable("habit_goals", {
  id: int("id").autoincrement().primaryKey(),
  user_id: int("user_id").notNull(),
  habit_id: int("habit_id").notNull(),
  goal_value: decimal("goal_value", { precision: 10, scale: 2, mode: "number" }).notNull(),
  goal_direction: mysqlEnum("goal_direction", GOAL_DIRECTIONS).notNull().default("at_least"),
  effective_from: date("effective_from", { mode: "string" }).notNull(),
  created_at: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_goal_habit_from").on(t.habit_id, t.effective_from),
]);

// One row per (habit, day). Success is derived from status/value + the goal in
// effect that day, never stored. No row = unknown.
export const habit_entries = mysqlTable("habit_entries", {
  id: int("id").autoincrement().primaryKey(),
  user_id: int("user_id").notNull(),
  habit_id: int("habit_id").notNull(),
  day: date("day", { mode: "string" }).notNull(),
  status: mysqlEnum("status", ENTRY_STATUSES).notNull(),
  value: decimal("value", { precision: 10, scale: 2, mode: "number" }),
  notes: text("notes"),
  line_dirs: text("line_dirs"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (t) => [
  uniqueIndex("uq_entry_habit_day").on(t.habit_id, t.day),
  index("idx_entry_user_day").on(t.user_id, t.day),
]);

// Per-habit catalog of things that went wrong. `suggest = false` hides a row
// from the chips but keeps it searchable and attached to its entries.
export const mistakes = mysqlTable("mistakes", {
  id: int("id").autoincrement().primaryKey(),
  user_id: int("user_id").notNull(),
  habit_id: int("habit_id").notNull(),
  text: varchar("text", { length: 255 }).notNull(),
  line_dirs: text("line_dirs"),
  suggest: boolean("suggest").notNull().default(true),
  created_at: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_mistake_habit_suggest").on(t.habit_id, t.suggest),
]);

export const entry_mistakes = mysqlTable("entry_mistakes", {
  user_id: int("user_id").notNull(),
  entry_id: int("entry_id").notNull(),
  mistake_id: int("mistake_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.entry_id, t.mistake_id] }),
  index("idx_em_mistake").on(t.mistake_id),
  index("idx_em_user").on(t.user_id),
]);
