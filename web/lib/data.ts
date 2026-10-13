import { and, eq, asc, desc } from "drizzle-orm";
import { db, tasks, ideas, users } from "@/db";
import { QUADRANTS, type Quadrant } from "@/db/schema";
import { DEFAULT_TIMEZONE, isValidTimezone } from "@/lib/date";

export type TaskRow = typeof tasks.$inferSelect;
export type IdeaRow = typeof ideas.$inferSelect;

export type NoteRow = {
  id: number;
  title: string;
  note: string | null;
  line_dirs: string | null;
};

/** Load all of a user's active (non-archived) ideas as notepad notes, most-recently-updated first. */
export async function loadNotes(userId: number): Promise<NoteRow[]> {
  return db
    .select({ id: ideas.id, title: ideas.title, note: ideas.note, line_dirs: ideas.line_dirs })
    .from(ideas)
    .where(and(eq(ideas.user_id, userId), eq(ideas.archived, false)))
    .orderBy(desc(ideas.updated_at), desc(ideas.id));
}

/** Load a user's archived notes for the /archived screen, most-recently-updated first. */
export async function loadArchivedNotes(userId: number): Promise<NoteRow[]> {
  return db
    .select({ id: ideas.id, title: ideas.title, note: ideas.note, line_dirs: ideas.line_dirs })
    .from(ideas)
    .where(and(eq(ideas.user_id, userId), eq(ideas.archived, true)))
    .orderBy(desc(ideas.updated_at), desc(ideas.id));
}

/** Load a single task's note fields, so a task can be edited in the notepad. */
export async function loadTaskNote(userId: number, taskId: number): Promise<NoteRow | null> {
  const [row] = await db
    .select({ id: tasks.id, title: tasks.title, note: tasks.note, line_dirs: tasks.line_dirs })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.user_id, userId)));
  return row ?? null;
}

export type DayData = {
  quadrants: Record<Quadrant, TaskRow[]>;
  ideas: IdeaRow[];
};

/** Load one day's tasks grouped by quadrant + the (day-independent) ideas inbox. */
export async function loadDay(userId: number, day: string): Promise<DayData> {
  const [taskRows, ideaRows] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.user_id, userId), eq(tasks.day, day)))
      .orderBy(asc(tasks.done), asc(tasks.position), asc(tasks.id)),
    db
      .select()
      .from(ideas)
      .where(and(eq(ideas.user_id, userId), eq(ideas.archived, false)))
      .orderBy(asc(ideas.position), asc(ideas.id)),
  ]);

  const quadrants = Object.fromEntries(QUADRANTS.map((q) => [q, [] as TaskRow[]])) as Record<Quadrant, TaskRow[]>;
  for (const t of taskRows) quadrants[t.quadrant].push(t);

  return { quadrants, ideas: ideaRows };
}

/** The user's IANA timezone, falling back to the default until one is stored. */
export async function loadUserTimezone(userId: number): Promise<string> {
  try {
    const [row] = await db.select({ tz: users.timezone }).from(users).where(eq(users.id, userId));
    return row?.tz && isValidTimezone(row.tz) ? row.tz : DEFAULT_TIMEZONE;
  } catch {
    // users.timezone missing until scripts/migrate-habits.mjs runs — keep the board up
    return DEFAULT_TIMEZONE;
  }
}
