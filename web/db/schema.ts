import {
  mysqlTable, int, varchar, text, boolean, datetime, date, mysqlEnum,
  timestamp, index,
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
