import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, habits, habit_goals, habit_entries, mistakes, entry_mistakes } from "@/db";
import { addDaysISO } from "@/lib/date";
import { CATCH_UP_WINDOW, catchUpDays } from "@/lib/habits/catchup";
import type { BoardHabit, CatchUpBlock, EntryDTO, HabitDTO, MistakeDTO } from "@/lib/habits/dto";
import type { GoalVersion } from "@/lib/habits/types";

/* Server-side loaders for the habit tracker. Every query filters by user_id. */

type HabitRow = typeof habits.$inferSelect;
type EntryRow = typeof habit_entries.$inferSelect;

function toHabitDTO(h: HabitRow, goals: GoalVersion[], hasEntries: boolean): HabitDTO {
  return {
    id: h.id,
    title: h.title,
    description: h.description,
    line_dirs: h.line_dirs,
    icon_type: h.icon_type,
    emoji: h.emoji,
    image_path: h.image_path,
    bg_color: h.bg_color,
    fg_color: h.fg_color,
    progress_type: h.progress_type,
    unit: h.unit,
    reminder_enabled: !!h.reminder_enabled,
    start_date: h.start_date,
    archived: !!h.archived,
    position: h.position,
    goals,
    hasEntries,
  };
}

export function toEntryDTO(e: EntryRow, mistakeIds: number[] = []): EntryDTO {
  return {
    id: e.id,
    habit_id: e.habit_id,
    day: e.day,
    status: e.status,
    value: e.value == null ? null : Number(e.value),
    notes: e.notes,
    line_dirs: e.line_dirs,
    mistakeIds,
  };
}

async function goalsByHabit(uid: number, habitIds: number[]): Promise<Map<number, GoalVersion[]>> {
  const out = new Map<number, GoalVersion[]>();
  if (!habitIds.length) return out;
  const rows = await db
    .select()
    .from(habit_goals)
    .where(and(eq(habit_goals.user_id, uid), inArray(habit_goals.habit_id, habitIds)))
    .orderBy(asc(habit_goals.effective_from), asc(habit_goals.id));
  for (const g of rows) {
    const list = out.get(g.habit_id) ?? [];
    list.push({ goal_value: Number(g.goal_value), goal_direction: g.goal_direction, effective_from: g.effective_from });
    out.set(g.habit_id, list);
  }
  return out;
}

async function habitsWithEntries(uid: number, habitIds: number[]): Promise<Set<number>> {
  if (!habitIds.length) return new Set();
  const rows = await db
    .selectDistinct({ habit_id: habit_entries.habit_id })
    .from(habit_entries)
    .where(and(eq(habit_entries.user_id, uid), inArray(habit_entries.habit_id, habitIds)));
  return new Set(rows.map((r) => r.habit_id));
}

async function hydrate(uid: number, rows: HabitRow[]): Promise<HabitDTO[]> {
  const ids = rows.map((h) => h.id);
  const [goals, withEntries] = await Promise.all([goalsByHabit(uid, ids), habitsWithEntries(uid, ids)]);
  return rows.map((h) => toHabitDTO(h, goals.get(h.id) ?? [], withEntries.has(h.id)));
}

export async function mistakeIdsByEntry(uid: number, entryIds: number[]): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  if (!entryIds.length) return out;
  const rows = await db
    .select({ entry_id: entry_mistakes.entry_id, mistake_id: entry_mistakes.mistake_id })
    .from(entry_mistakes)
    .where(and(eq(entry_mistakes.user_id, uid), inArray(entry_mistakes.entry_id, entryIds)));
  for (const r of rows) out.set(r.entry_id, [...(out.get(r.entry_id) ?? []), r.mistake_id]);
  return out;
}

/** Active habits (by position) and archived ones (most recently changed first). */
export async function loadHabitList(uid: number): Promise<{ active: HabitDTO[]; archived: HabitDTO[] }> {
  const rows = await db
    .select()
    .from(habits)
    .where(eq(habits.user_id, uid))
    .orderBy(asc(habits.position), asc(habits.id));
  const all = await hydrate(uid, rows);
  const archivedOrder = new Map(rows.map((r) => [r.id, r.updated_at?.getTime() ?? 0]));
  return {
    active: all.filter((h) => !h.archived),
    archived: all.filter((h) => h.archived).sort((a, b) => (archivedOrder.get(b.id) ?? 0) - (archivedOrder.get(a.id) ?? 0)),
  };
}

export async function loadHabit(uid: number, id: number): Promise<HabitDTO | null> {
  const [row] = await db.select().from(habits).where(and(eq(habits.id, id), eq(habits.user_id, uid)));
  if (!row) return null;
  const [dto] = await hydrate(uid, [row]);
  return dto;
}

/** Active habits that have started by `day`, each with its entry for that day. */
export async function loadBoardHabits(uid: number, day: string): Promise<BoardHabit[]> {
  const rows = await db
    .select()
    .from(habits)
    .where(and(eq(habits.user_id, uid), eq(habits.archived, false), lte(habits.start_date, day)))
    .orderBy(asc(habits.position), asc(habits.id));
  if (!rows.length) return [];
  const list = await hydrate(uid, rows);
  const entries = await db
    .select()
    .from(habit_entries)
    .where(and(eq(habit_entries.user_id, uid), eq(habit_entries.day, day), inArray(habit_entries.habit_id, rows.map((r) => r.id))));
  const mids = await mistakeIdsByEntry(uid, entries.map((e) => e.id));
  const byHabit = new Map(entries.map((e) => [e.habit_id, toEntryDTO(e, mids.get(e.id) ?? [])]));
  return list.map((h) => ({ ...h, entry: byHabit.get(h.id) ?? null }));
}

/** Catalog rows with how many entries reference each. `habitId` null = all of the user's habits. */
export async function loadMistakeCatalog(uid: number, habitId: number | null): Promise<MistakeDTO[]> {
  const usage = db
    .select({ mistake_id: entry_mistakes.mistake_id, n: sql<number>`COUNT(*)`.as("n") })
    .from(entry_mistakes)
    .where(eq(entry_mistakes.user_id, uid))
    .groupBy(entry_mistakes.mistake_id)
    .as("usage");
  const rows = await db
    .select({
      id: mistakes.id,
      habit_id: mistakes.habit_id,
      text: mistakes.text,
      line_dirs: mistakes.line_dirs,
      suggest: mistakes.suggest,
      created_at: mistakes.created_at,
      usage_count: sql<number>`COALESCE(${usage.n}, 0)`,
    })
    .from(mistakes)
    .leftJoin(usage, eq(usage.mistake_id, mistakes.id))
    .where(habitId == null ? eq(mistakes.user_id, uid) : and(eq(mistakes.user_id, uid), eq(mistakes.habit_id, habitId)))
    .orderBy(desc(mistakes.created_at), desc(mistakes.id));
  return rows.map((r) => ({
    id: r.id,
    habit_id: r.habit_id,
    text: r.text,
    line_dirs: r.line_dirs,
    suggest: !!r.suggest,
    usage_count: Number(r.usage_count),
    created_at: (r.created_at ?? new Date(0)).toISOString(),
  }));
}

/** Per reminder-enabled habit, the days of the last 14 that have no entry. */
export async function loadCatchUp(uid: number, today: string): Promise<CatchUpBlock[]> {
  const yesterday = addDaysISO(today, -1);
  const oldest = addDaysISO(today, -CATCH_UP_WINDOW);
  const rows = await db
    .select()
    .from(habits)
    .where(and(
      eq(habits.user_id, uid), eq(habits.archived, false), eq(habits.reminder_enabled, true),
      lte(habits.start_date, yesterday),
    ))
    .orderBy(asc(habits.position), asc(habits.id));
  if (!rows.length) return [];
  const entries = await db
    .select({ habit_id: habit_entries.habit_id, day: habit_entries.day })
    .from(habit_entries)
    .where(and(
      eq(habit_entries.user_id, uid), inArray(habit_entries.habit_id, rows.map((r) => r.id)),
      gte(habit_entries.day, oldest), lte(habit_entries.day, yesterday),
    ));
  const daysByHabit = new Map<number, Set<string>>();
  for (const e of entries) {
    const s = daysByHabit.get(e.habit_id) ?? new Set<string>();
    s.add(e.day);
    daysByHabit.set(e.habit_id, s);
  }
  const blocks: CatchUpBlock[] = [];
  const list = await hydrate(uid, rows);
  for (const h of list) {
    const days = catchUpDays({ today, startDate: h.start_date, entryDays: daysByHabit.get(h.id) ?? new Set() });
    if (days.length) blocks.push({ habit: h, days });
  }
  return blocks;
}

/** Everything the analytics page needs for one habit. */
export async function loadHabitAnalytics(uid: number, habitId: number): Promise<{ entries: EntryDTO[]; mistakes: MistakeDTO[] }> {
  const rows = await db
    .select()
    .from(habit_entries)
    .where(and(eq(habit_entries.user_id, uid), eq(habit_entries.habit_id, habitId)))
    .orderBy(asc(habit_entries.day));
  const mids = await mistakeIdsByEntry(uid, rows.map((e) => e.id));
  const catalog = await loadMistakeCatalog(uid, habitId);
  return { entries: rows.map((e) => toEntryDTO(e, mids.get(e.id) ?? [])), mistakes: catalog };
}
