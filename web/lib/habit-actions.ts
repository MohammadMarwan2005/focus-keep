"use server";

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { unlink } from "fs/promises";
import { db, habits, habit_goals, habit_entries, mistakes, entry_mistakes, users } from "@/db";
import { requireSession } from "@/lib/auth";
import { loadUserTimezone } from "@/lib/data";
import { todayISOInTz } from "@/lib/date";
import { safeDataPath } from "@/lib/stream";
import {
  loadCatchUp, loadHabit, loadMistakeCatalog, mistakeIdsByEntry, toEntryDTO,
} from "@/lib/habit-data";
import { resolveGoal } from "@/lib/habits/goals";
import { findMatchingMistake, mistakeKey, normalizeMistakeText } from "@/lib/habits/mistakes";
import { ownedIconPath } from "@/lib/habits/files";
import { sanitizeLineDirs } from "@/lib/habits/bidi";
import {
  resolveToday, validateColor, validateDate, validateDay, validateDescription, validateEmoji, validateGoal,
  validateGoalDirection, validateId, validateMistakeText, validateNotes, validateProgressType, validateStatus,
  validateTimezone, validateTitle, validateUnit, validateValue, type Validation,
} from "@/lib/habits/validate";
import type {
  CatchUpBlock, EntryDTO, HabitDTO, HabitInput, MistakeDTO, Result,
} from "@/lib/habits/dto";
import type { EntryStatus } from "@/lib/habits/types";

// Same convention as lib/actions.ts: no revalidatePath; views refresh themselves.

/* ------------------------------ plumbing ------------------------------ */

class UserError extends Error {}

function must<T>(v: Validation<T>): T {
  if (!v.ok) throw new UserError(v.error);
  return v.value;
}

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof Error && e.message === "unauthorized") {
      return { ok: false, error: "انتهت الجلسة، سجّل الدخول من جديد" };
    }
    console.error("[habits]", e);
    return { ok: false, error: "تعذّر الحفظ، حاول مرة أخرى" };
  }
}

async function uid(): Promise<number> {
  return (await requireSession()).uid;
}

/** The user's id and "today", checked against the client's local date. */
async function ctx(clientToday: unknown): Promise<{ uid: number; today: string }> {
  const u = await uid();
  const serverToday = todayISOInTz(await loadUserTimezone(u));
  return { uid: u, today: must(resolveToday(clientToday, serverToday)) };
}

async function ownedHabit(u: number, habitId: unknown) {
  const id = must(validateId(habitId));
  const [h] = await db.select().from(habits).where(and(eq(habits.id, id), eq(habits.user_id, u)));
  if (!h) throw new UserError("العادة غير موجودة");
  return h;
}

async function ownedEntry(u: number, entryId: unknown) {
  const id = must(validateId(entryId));
  const [e] = await db.select().from(habit_entries).where(and(eq(habit_entries.id, id), eq(habit_entries.user_id, u)));
  if (!e) throw new UserError("التسجيل غير موجود");
  return e;
}

async function ownedMistake(u: number, mistakeId: unknown) {
  const id = must(validateId(mistakeId));
  const [m] = await db.select().from(mistakes).where(and(eq(mistakes.id, id), eq(mistakes.user_id, u)));
  if (!m) throw new UserError("الخطأ غير موجود");
  return m;
}

async function habitDTO(u: number, id: number): Promise<HabitDTO> {
  const h = await loadHabit(u, id);
  if (!h) throw new UserError("العادة غير موجودة");
  return h;
}

/* ------------------------------- habits -------------------------------- */

type CleanHabit = {
  title: string;
  description: string | null;
  line_dirs: string | null;
  icon_type: "emoji" | "image" | "svg";
  emoji: string | null;
  image_path: string | null;
  bg_color: string | null;
  fg_color: string | null;
  progress_type: "boolean" | "measured";
  unit: string | null;
  reminder_enabled: boolean;
  start_date: string;
  goal: { goal_value: number; goal_direction: "at_least" | "at_most" } | null;
};

function cleanHabit(u: number, input: HabitInput): CleanHabit {
  if (!input || typeof input !== "object") throw new UserError("بيانات ناقصة");
  const title = must(validateTitle(input.title));
  const description = must(validateDescription(input.description));
  const progress_type = must(validateProgressType(input.progress_type));
  const start_date = must(validateDate(input.start_date));
  const bg_color = must(validateColor(input.bg_color));
  const fg_color = must(validateColor(input.fg_color));

  const icon_type = input.icon_type;
  let emoji: string | null = null;
  let image_path: string | null = null;
  if (icon_type === "emoji") {
    emoji = must(validateEmoji(input.emoji)) ?? "⭐";
  } else if (icon_type === "image" || icon_type === "svg") {
    image_path = ownedIconPath(u, input.image_path, icon_type);
    if (!image_path || !safeDataPath(image_path)) throw new UserError("ارفع صورة للأيقونة أولاً");
  } else {
    throw new UserError("نوع الأيقونة غير صالح");
  }

  let unit: string | null = null;
  let goal: CleanHabit["goal"] = null;
  if (progress_type === "measured") {
    unit = must(validateUnit(input.unit));
    goal = {
      goal_value: must(validateGoal(input.goal_value)),
      goal_direction: must(validateGoalDirection(input.goal_direction)),
    };
  }

  return {
    title, description,
    line_dirs: sanitizeLineDirs(input.line_dirs, description),
    icon_type, emoji, image_path, bg_color, fg_color,
    progress_type, unit,
    reminder_enabled: input.reminder_enabled !== false,
    start_date, goal,
  };
}

/** Delete an icon file once no habit of this user points at it any more. */
async function removeIconIfUnused(u: number, rel: string | null) {
  if (!rel || !ownedIconPath(u, rel, rel.endsWith(".svg") ? "svg" : "image")) return;
  const [{ n }] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(habits)
    .where(and(eq(habits.user_id, u), eq(habits.image_path, rel)));
  if (Number(n) > 0) return;
  const abs = safeDataPath(rel);
  if (abs) await unlink(abs).catch(() => {});
}

export async function createHabit(input: HabitInput, clientToday?: string): Promise<Result<HabitDTO>> {
  return run(async () => {
    const { uid: u } = await ctx(clientToday);
    const c = cleanHabit(u, input);
    const [{ max }] = await db
      .select({ max: sql<number>`COALESCE(MAX(${habits.position}), -1)` })
      .from(habits)
      .where(eq(habits.user_id, u));
    const [res] = await db.insert(habits).values({
      user_id: u,
      title: c.title, description: c.description, line_dirs: c.line_dirs,
      icon_type: c.icon_type, emoji: c.emoji, image_path: c.image_path, bg_color: c.bg_color, fg_color: c.fg_color,
      progress_type: c.progress_type, unit: c.unit, reminder_enabled: c.reminder_enabled,
      start_date: c.start_date, position: Number(max ?? -1) + 1,
    });
    const id = Number((res as { insertId: number }).insertId);
    if (c.goal) {
      // the first goal version covers the habit's whole history
      await db.insert(habit_goals).values({ user_id: u, habit_id: id, ...c.goal, effective_from: c.start_date });
    }
    return habitDTO(u, id);
  });
}

export async function updateHabit(id: number, input: HabitInput, clientToday?: string): Promise<Result<HabitDTO>> {
  return run(async () => {
    const { uid: u, today } = await ctx(clientToday);
    const h = await ownedHabit(u, id);
    const c = cleanHabit(u, input);

    const [{ n }] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(habit_entries)
      .where(and(eq(habit_entries.user_id, u), eq(habit_entries.habit_id, h.id)));
    const hasEntries = Number(n) > 0;
    if (hasEntries && c.progress_type !== h.progress_type) {
      throw new UserError("لا يمكن تغيير نوع التقدّم بعد أول تسجيل");
    }

    await db.update(habits).set({
      title: c.title, description: c.description, line_dirs: c.line_dirs,
      icon_type: c.icon_type, emoji: c.emoji, image_path: c.image_path, bg_color: c.bg_color, fg_color: c.fg_color,
      progress_type: c.progress_type, unit: c.unit, reminder_enabled: c.reminder_enabled, start_date: c.start_date,
    }).where(and(eq(habits.id, h.id), eq(habits.user_id, u)));

    const goals = await db
      .select()
      .from(habit_goals)
      .where(and(eq(habit_goals.user_id, u), eq(habit_goals.habit_id, h.id)))
      .orderBy(asc(habit_goals.effective_from), asc(habit_goals.id));

    if (c.progress_type === "boolean") {
      // only reachable without entries (type is locked otherwise), so no history to keep
      if (goals.length) await db.delete(habit_goals).where(and(eq(habit_goals.user_id, u), eq(habit_goals.habit_id, h.id)));
    } else if (c.goal) {
      if (!goals.length) {
        await db.insert(habit_goals).values({ user_id: u, habit_id: h.id, ...c.goal, effective_from: c.start_date });
      } else {
        // a start date moved earlier than the first version extends that version back
        if (c.start_date < goals[0].effective_from) {
          await db.update(habit_goals).set({ effective_from: c.start_date })
            .where(and(eq(habit_goals.id, goals[0].id), eq(habit_goals.user_id, u)));
          goals[0].effective_from = c.start_date;
        }
        const versions = goals.map((g) => ({ ...g, goal_value: Number(g.goal_value) }));
        const asOf = today < c.start_date ? c.start_date : today;
        const current = resolveGoal(versions, asOf) ?? versions[0];
        const changed = current.goal_value !== c.goal.goal_value || current.goal_direction !== c.goal.goal_direction;
        if (changed) {
          // never edit history: a new version effective today (or replace today's own version)
          const sameDay = goals.find((g) => g.effective_from === asOf);
          if (sameDay) {
            await db.update(habit_goals).set(c.goal).where(and(eq(habit_goals.id, sameDay.id), eq(habit_goals.user_id, u)));
          } else {
            await db.insert(habit_goals).values({ user_id: u, habit_id: h.id, ...c.goal, effective_from: asOf });
          }
        }
      }
    }

    if (h.image_path && h.image_path !== c.image_path) await removeIconIfUnused(u, h.image_path);
    return habitDTO(u, h.id);
  });
}

export async function archiveHabit(id: number): Promise<Result<null>> {
  return run(async () => {
    const u = await uid();
    const h = await ownedHabit(u, id);
    await db.update(habits).set({ archived: true }).where(and(eq(habits.id, h.id), eq(habits.user_id, u)));
    return null;
  });
}

export async function unarchiveHabit(id: number): Promise<Result<HabitDTO>> {
  return run(async () => {
    const u = await uid();
    const h = await ownedHabit(u, id);
    const [{ max }] = await db
      .select({ max: sql<number>`COALESCE(MAX(${habits.position}), -1)` })
      .from(habits)
      .where(and(eq(habits.user_id, u), eq(habits.archived, false)));
    // a restored habit returns to its old place unless that collides; append otherwise
    const position = h.position <= Number(max ?? -1) ? h.position : Number(max ?? -1) + 1;
    await db.update(habits).set({ archived: false, position }).where(and(eq(habits.id, h.id), eq(habits.user_id, u)));
    return habitDTO(u, h.id);
  });
}

export async function reorderHabits(orderedIds: number[]): Promise<Result<null>> {
  return run(async () => {
    const u = await uid();
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) return null;
    const ids = orderedIds.map((x) => must(validateId(x)));
    const owned = await db
      .select({ id: habits.id })
      .from(habits)
      .where(and(eq(habits.user_id, u), inArray(habits.id, ids)));
    const ok = new Set(owned.map((r) => r.id));
    await Promise.all(
      ids.filter((id) => ok.has(id)).map((id, i) =>
        db.update(habits).set({ position: i }).where(and(eq(habits.id, id), eq(habits.user_id, u))),
      ),
    );
    return null;
  });
}

/* ------------------------------- entries ------------------------------- */

type EntryWrite = { status: EntryStatus; value: number | null };

function cleanEntry(progressType: "boolean" | "measured", status: unknown, value: unknown): EntryWrite {
  const s = must(validateStatus(status));
  if (progressType === "boolean" || s !== "done") return { status: s, value: null };
  return { status: s, value: must(validateValue(value)) };
}

function checkDay(day: unknown, today: string, startDate: string): string {
  const d = must(validateDay(day, today));
  if (d < startDate) throw new UserError("هذا اليوم قبل تاريخ بدء العادة");
  return d;
}

async function entryDTO(u: number, habitId: number, day: string): Promise<EntryDTO> {
  const [e] = await db
    .select()
    .from(habit_entries)
    .where(and(eq(habit_entries.user_id, u), eq(habit_entries.habit_id, habitId), eq(habit_entries.day, day)));
  if (!e) throw new UserError("تعذّر الحفظ، حاول مرة أخرى");
  const mids = await mistakeIdsByEntry(u, [e.id]);
  return toEntryDTO(e, mids.get(e.id) ?? []);
}

/**
 * Record one (habit, day). An upsert on the unique (habit_id, day) key, so a
 * double submit just writes the same row twice.
 */
export async function saveEntry(args: {
  habitId: number; day: string; status: EntryStatus; value?: number | string | null; clientToday?: string;
}): Promise<Result<EntryDTO>> {
  return run(async () => {
    const { uid: u, today } = await ctx(args?.clientToday);
    const h = await ownedHabit(u, args?.habitId);
    if (h.archived) throw new UserError("العادة مؤرشفة");
    const day = checkDay(args.day, today, h.start_date);
    const w = cleanEntry(h.progress_type, args.status, args.value);
    await db
      .insert(habit_entries)
      .values({ user_id: u, habit_id: h.id, day, status: w.status, value: w.value })
      .onDuplicateKeyUpdate({ set: { status: w.status, value: w.value } });
    return entryDTO(u, h.id, day);
  });
}

/** Bulk: skip for any habit; done / not done for boolean habits only. */
export async function saveEntriesBulk(args: {
  habitId: number; days: string[]; status: EntryStatus; clientToday?: string;
}): Promise<Result<EntryDTO[]>> {
  return run(async () => {
    const { uid: u, today } = await ctx(args?.clientToday);
    const h = await ownedHabit(u, args?.habitId);
    if (h.archived) throw new UserError("العادة مؤرشفة");
    const status = must(validateStatus(args.status));
    if (h.progress_type === "measured" && status !== "skipped") {
      throw new UserError("أدخل قيم العادات المقاسة يوماً بيوم");
    }
    if (!Array.isArray(args.days) || args.days.length === 0) throw new UserError("اختر يوماً واحداً على الأقل");
    if (args.days.length > 31) throw new UserError("عدد الأيام كبير");
    const days = [...new Set(args.days.map((d) => checkDay(d, today, h.start_date)))];
    await db
      .insert(habit_entries)
      .values(days.map((day) => ({ user_id: u, habit_id: h.id, day, status, value: null })))
      .onDuplicateKeyUpdate({ set: { status, value: null } });
    return Promise.all(days.map((d) => entryDTO(u, h.id, d)));
  });
}

/** Remove a day's record entirely (back to unknown). */
export async function clearEntry(args: { habitId: number; day: string }): Promise<Result<null>> {
  return run(async () => {
    const u = await uid();
    const h = await ownedHabit(u, args?.habitId);
    const day = must(validateDate(args.day));
    const [e] = await db
      .select({ id: habit_entries.id })
      .from(habit_entries)
      .where(and(eq(habit_entries.user_id, u), eq(habit_entries.habit_id, h.id), eq(habit_entries.day, day)));
    if (!e) return null;
    await db.delete(entry_mistakes).where(and(eq(entry_mistakes.user_id, u), eq(entry_mistakes.entry_id, e.id)));
    await db.delete(habit_entries).where(and(eq(habit_entries.id, e.id), eq(habit_entries.user_id, u)));
    return null;
  });
}

export async function saveEntryNotes(args: { entryId: number; notes: string; line_dirs: string | null }): Promise<Result<null>> {
  return run(async () => {
    const u = await uid();
    const e = await ownedEntry(u, args?.entryId);
    const notes = must(validateNotes(args.notes));
    await db
      .update(habit_entries)
      .set({ notes, line_dirs: sanitizeLineDirs(args.line_dirs, notes) })
      .where(and(eq(habit_entries.id, e.id), eq(habit_entries.user_id, u)));
    return null;
  });
}

/* ------------------------------- mistakes ------------------------------ */

export async function listHabitMistakes(habitId: number): Promise<Result<MistakeDTO[]>> {
  return run(async () => {
    const u = await uid();
    const h = await ownedHabit(u, habitId);
    return loadMistakeCatalog(u, h.id);
  });
}

export async function setEntryMistake(args: { entryId: number; mistakeId: number; attached: boolean }): Promise<Result<null>> {
  return run(async () => {
    const u = await uid();
    const e = await ownedEntry(u, args?.entryId);
    const m = await ownedMistake(u, args.mistakeId);
    if (m.habit_id !== e.habit_id) throw new UserError("هذا الخطأ لا يخص هذه العادة");
    if (args.attached) {
      await db.insert(entry_mistakes).ignore().values({ user_id: u, entry_id: e.id, mistake_id: m.id });
    } else {
      await db.delete(entry_mistakes).where(and(
        eq(entry_mistakes.user_id, u), eq(entry_mistakes.entry_id, e.id), eq(entry_mistakes.mistake_id, m.id),
      ));
    }
    return null;
  });
}

/** Free text: reuse the catalog row with the same (normalised) text, else create one; then attach. */
export async function addEntryMistake(args: { entryId: number; text: string }): Promise<Result<MistakeDTO>> {
  return run(async () => {
    const u = await uid();
    const e = await ownedEntry(u, args?.entryId);
    const text = normalizeMistakeText(must(validateMistakeText(args.text)));
    const catalog = await db
      .select({ id: mistakes.id, text: mistakes.text })
      .from(mistakes)
      .where(and(eq(mistakes.user_id, u), eq(mistakes.habit_id, e.habit_id)));
    let id = findMatchingMistake(catalog, text)?.id;
    if (!id) {
      const [res] = await db.insert(mistakes).values({ user_id: u, habit_id: e.habit_id, text });
      id = Number((res as { insertId: number }).insertId);
    }
    await db.insert(entry_mistakes).ignore().values({ user_id: u, entry_id: e.id, mistake_id: id });
    const row = (await loadMistakeCatalog(u, e.habit_id)).find((m) => m.id === id);
    if (!row) throw new UserError("تعذّر الحفظ، حاول مرة أخرى");
    return row;
  });
}

/** "لا تقترحه" flips suggest only; the row stays attached and searchable. */
export async function setMistakeSuggest(args: { mistakeId: number; suggest: boolean }): Promise<Result<null>> {
  return run(async () => {
    const u = await uid();
    const m = await ownedMistake(u, args?.mistakeId);
    await db.update(mistakes).set({ suggest: !!args.suggest }).where(and(eq(mistakes.id, m.id), eq(mistakes.user_id, u)));
    return null;
  });
}

export async function updateMistakeText(args: { mistakeId: number; text: string; line_dirs: string | null }): Promise<Result<null>> {
  return run(async () => {
    const u = await uid();
    const m = await ownedMistake(u, args?.mistakeId);
    const text = normalizeMistakeText(must(validateMistakeText(args.text)));
    const others = await db
      .select({ id: mistakes.id, text: mistakes.text })
      .from(mistakes)
      .where(and(eq(mistakes.user_id, u), eq(mistakes.habit_id, m.habit_id), ne(mistakes.id, m.id)));
    if (others.some((o) => mistakeKey(o.text) === mistakeKey(text))) throw new UserError("يوجد خطأ بالنص نفسه لهذه العادة");
    await db
      .update(mistakes)
      .set({ text, line_dirs: sanitizeLineDirs(args.line_dirs, text) })
      .where(and(eq(mistakes.id, m.id), eq(mistakes.user_id, u)));
    return null;
  });
}

/** Hard delete, only for rows no entry references. */
export async function deleteMistake(mistakeId: number): Promise<Result<null>> {
  return run(async () => {
    const u = await uid();
    const m = await ownedMistake(u, mistakeId);
    const [{ n }] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(entry_mistakes)
      .where(and(eq(entry_mistakes.user_id, u), eq(entry_mistakes.mistake_id, m.id)));
    if (Number(n) > 0) throw new UserError("لا يمكن حذف خطأ مرتبط بتسجيلات؛ أوقف اقتراحه بدلاً من ذلك");
    await db.delete(mistakes).where(and(eq(mistakes.id, m.id), eq(mistakes.user_id, u)));
    return null;
  });
}

/* --------------------------- catch-up & settings ----------------------- */

export async function getCatchUp(clientToday?: string): Promise<Result<{ today: string; blocks: CatchUpBlock[] }>> {
  return run(async () => {
    const { uid: u, today } = await ctx(clientToday);
    return { today, blocks: await loadCatchUp(u, today) };
  });
}

export async function setTimezone(tz: string): Promise<Result<string>> {
  return run(async () => {
    const u = await uid();
    const zone = must(validateTimezone(tz));
    await db.update(users).set({ timezone: zone }).where(eq(users.id, u));
    return zone;
  });
}
