"use server";

import { and, eq, inArray, sql, asc } from "drizzle-orm";
import { db, tasks, ideas } from "@/db";
import type { Quadrant } from "@/db/schema";
import { requireSession } from "@/lib/auth";

// NOTE: pages are `force-dynamic`, so every navigation reloads fresh from the DB
// and there is no route cache to invalidate. We deliberately do NOT call
// revalidatePath here: it would push a server re-render into the client mid-edit
// and clobber optimistic UI state (e.g. a second task typed before the first
// save returns). Views that must refresh after an action call router.refresh().

async function uid(): Promise<number> {
  const s = await requireSession();
  return s.uid;
}

/* ------------------------------- tasks -------------------------------- */

export async function addTask(day: string, quadrant: Quadrant, title: string) {
  const t = title.trim();
  if (!t) return;
  const u = await uid();
  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${tasks.position}), -1)` })
    .from(tasks)
    .where(and(eq(tasks.user_id, u), eq(tasks.day, day), eq(tasks.quadrant, quadrant)));
  const [res] = await db.insert(tasks).values({
    user_id: u, day, quadrant, title: t, position: (max ?? -1) + 1,
  });
  return { id: Number((res as { insertId: number }).insertId), position: (max ?? -1) + 1 };
}

export async function updateTask(
  id: number,
  patch: { title?: string; note?: string; line_dirs?: string | null },
) {
  const u = await uid();
  const set: Record<string, unknown> = {};
  if (patch.title !== undefined) set.title = patch.title.trim();
  if (patch.note !== undefined) set.note = patch.note;
  if (patch.line_dirs !== undefined) set.line_dirs = patch.line_dirs;
  if (Object.keys(set).length === 0) return;
  await db.update(tasks).set(set).where(and(eq(tasks.id, id), eq(tasks.user_id, u)));
}

export async function setDone(id: number, done: boolean) {
  const u = await uid();
  await db
    .update(tasks)
    .set({ done, done_at: done ? new Date() : null })
    .where(and(eq(tasks.id, id), eq(tasks.user_id, u)));
}

export async function deleteTask(id: number) {
  const u = await uid();
  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.user_id, u)));
}

/** Re-insert a deleted task (for undo), restoring its quadrant/position/done state. */
export async function restoreTask(snap: {
  day: string;
  quadrant: Quadrant;
  title: string;
  note: string | null;
  line_dirs: string | null;
  done: boolean;
  position: number;
}) {
  const u = await uid();
  const [res] = await db.insert(tasks).values({
    user_id: u,
    day: snap.day,
    quadrant: snap.quadrant,
    title: snap.title,
    note: snap.note,
    line_dirs: snap.line_dirs,
    done: snap.done,
    done_at: snap.done ? new Date() : null,
    position: snap.position,
  });
  return { id: Number((res as { insertId: number }).insertId) };
}

/**
 * Reorder / move. `orderedIds` is the full ordered id list of the target
 * quadrant on `day` after the drop. Every listed task is (re)assigned to that
 * day+quadrant and given its index as position — this covers within-quadrant
 * reordering, cross-quadrant moves, and cross-day moves in one call.
 */
export async function reorderQuadrant(
  day: string,
  quadrant: Quadrant,
  orderedIds: number[],
) {
  const u = await uid();
  if (orderedIds.length === 0) return;
  // guard: only touch rows this user owns
  const owned = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.user_id, u), inArray(tasks.id, orderedIds)));
  const ok = new Set(owned.map((r) => r.id));
  await Promise.all(
    orderedIds
      .filter((id) => ok.has(id))
      .map((id, i) =>
        db
          .update(tasks)
          .set({ day, quadrant, position: i })
          .where(and(eq(tasks.id, id), eq(tasks.user_id, u))),
      ),
  );
}

/** Move a single task to another day (keeps quadrant, appends to the end). */
export async function moveTaskToDay(id: number, day: string) {
  const u = await uid();
  const [row] = await db
    .select({ quadrant: tasks.quadrant })
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.user_id, u)));
  if (!row) return;
  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${tasks.position}), -1)` })
    .from(tasks)
    .where(and(eq(tasks.user_id, u), eq(tasks.day, day), eq(tasks.quadrant, row.quadrant)));
  await db
    .update(tasks)
    .set({ day, position: (max ?? -1) + 1 })
    .where(and(eq(tasks.id, id), eq(tasks.user_id, u)));
}

/* ------------------------------- ideas -------------------------------- */

export async function addIdea(title: string) {
  const t = title.trim();
  if (!t) return;
  const u = await uid();
  const [{ min }] = await db
    .select({ min: sql<number>`COALESCE(MIN(${ideas.position}), 0)` })
    .from(ideas)
    .where(eq(ideas.user_id, u));
  const [res] = await db.insert(ideas).values({ user_id: u, title: t, position: (min ?? 0) - 1 });
  return { id: Number((res as { insertId: number }).insertId) };
}

export async function updateIdea(
  id: number,
  patch: { title?: string; note?: string; line_dirs?: string | null },
) {
  const u = await uid();
  const set: Record<string, unknown> = {};
  if (patch.title !== undefined) set.title = patch.title.trim();
  if (patch.note !== undefined) set.note = patch.note;
  if (patch.line_dirs !== undefined) set.line_dirs = patch.line_dirs;
  if (Object.keys(set).length === 0) return;
  await db.update(ideas).set(set).where(and(eq(ideas.id, id), eq(ideas.user_id, u)));
}

/** Create a note (an idea with a body). Appears at the top of the ideas inbox. */
export async function createNote(
  title: string,
  note: string,
  line_dirs: string | null,
) {
  const t = title.trim();
  if (!t) return;
  const u = await uid();
  const [{ min }] = await db
    .select({ min: sql<number>`COALESCE(MIN(${ideas.position}), 0)` })
    .from(ideas)
    .where(eq(ideas.user_id, u));
  const [res] = await db
    .insert(ideas)
    .values({ user_id: u, title: t, note, line_dirs, position: (min ?? 0) - 1 });
  return { id: Number((res as { insertId: number }).insertId) };
}

/** Re-insert a deleted idea/note (for undo). */
export async function restoreIdea(snap: {
  title: string;
  note: string | null;
  line_dirs: string | null;
  position: number;
  archived?: boolean;
}) {
  const u = await uid();
  const [res] = await db.insert(ideas).values({
    user_id: u,
    title: snap.title,
    note: snap.note,
    line_dirs: snap.line_dirs,
    archived: snap.archived ?? false,
    position: snap.position,
  });
  return { id: Number((res as { insertId: number }).insertId) };
}

/** Move a note to the archive (hidden from the inbox and the notepad list). */
export async function archiveIdea(id: number) {
  const u = await uid();
  await db.update(ideas).set({ archived: true }).where(and(eq(ideas.id, id), eq(ideas.user_id, u)));
}

/** Restore an archived note back into the active ideas/notes list. */
export async function unarchiveIdea(id: number) {
  const u = await uid();
  await db.update(ideas).set({ archived: false }).where(and(eq(ideas.id, id), eq(ideas.user_id, u)));
}

export async function reorderIdeas(orderedIds: number[]) {
  const u = await uid();
  if (orderedIds.length === 0) return;
  const owned = await db
    .select({ id: ideas.id })
    .from(ideas)
    .where(and(eq(ideas.user_id, u), inArray(ideas.id, orderedIds)));
  const ok = new Set(owned.map((r) => r.id));
  await Promise.all(
    orderedIds
      .filter((id) => ok.has(id))
      .map((id, i) =>
        db.update(ideas).set({ position: i }).where(and(eq(ideas.id, id), eq(ideas.user_id, u))),
      ),
  );
}

export async function deleteIdea(id: number) {
  const u = await uid();
  await db.delete(ideas).where(and(eq(ideas.id, id), eq(ideas.user_id, u)));
}

/** Turn an idea into a task on the given day/quadrant (idea is removed). */
export async function ideaToTask(ideaId: number, day: string, quadrant: Quadrant) {
  const u = await uid();
  const [idea] = await db
    .select()
    .from(ideas)
    .where(and(eq(ideas.id, ideaId), eq(ideas.user_id, u)));
  if (!idea) return;
  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${tasks.position}), -1)` })
    .from(tasks)
    .where(and(eq(tasks.user_id, u), eq(tasks.day, day), eq(tasks.quadrant, quadrant)));
  const [res] = await db.insert(tasks).values({
    user_id: u, day, quadrant, title: idea.title, note: idea.note, line_dirs: idea.line_dirs, position: (max ?? -1) + 1,
  });
  await db.delete(ideas).where(and(eq(ideas.id, ideaId), eq(ideas.user_id, u)));
  return { id: Number((res as { insertId: number }).insertId) };
}

/** Send a task back to the ideas inbox (removes it from the day). */
export async function taskToIdea(taskId: number) {
  const u = await uid();
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.user_id, u)));
  if (!row) return;
  const [{ min }] = await db
    .select({ min: sql<number>`COALESCE(MIN(${ideas.position}), 0)` })
    .from(ideas)
    .where(eq(ideas.user_id, u));
  const [res] = await db.insert(ideas).values({ user_id: u, title: row.title, note: row.note, line_dirs: row.line_dirs, position: (min ?? 0) - 1 });
  await db.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.user_id, u)));
  return { id: Number((res as { insertId: number }).insertId) };
}

/* --------------------------- copy from yesterday ---------------------- */

/**
 * Preview for the modal: yesterday's tasks plus the set of quadrant::title keys
 * already present on `day` (so the UI can mark those as already copied).
 */
export async function getPreviousDayTasks(day: string) {
  const u = await uid();
  const prev = addDays(day, -1);
  const [rows, existingRows] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.user_id, u), eq(tasks.day, prev)))
      .orderBy(asc(tasks.quadrant), asc(tasks.position)),
    db
      .select({ quadrant: tasks.quadrant, title: tasks.title })
      .from(tasks)
      .where(and(eq(tasks.user_id, u), eq(tasks.day, day))),
  ]);
  const existingKeys = existingRows.map((r) => `${r.quadrant}::${r.title.trim()}`);
  return { prev, rows, existingKeys };
}

/** Copy selected task ids from the previous day into `day` (skips duplicates). */
export async function copyFromYesterday(day: string, taskIds: number[]) {
  const u = await uid();
  if (taskIds.length === 0) return { copied: 0 };
  const src = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.user_id, u), inArray(tasks.id, taskIds)));

  // existing titles per quadrant today, to dedupe
  const existing = await db
    .select({ quadrant: tasks.quadrant, title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.user_id, u), eq(tasks.day, day)));
  const seen = new Set(existing.map((r) => `${r.quadrant}::${r.title.trim()}`));

  const maxByQ = new Map<string, number>();
  for (const q of new Set(src.map((r) => r.quadrant))) {
    const [{ max }] = await db
      .select({ max: sql<number>`COALESCE(MAX(${tasks.position}), -1)` })
      .from(tasks)
      .where(and(eq(tasks.user_id, u), eq(tasks.day, day), eq(tasks.quadrant, q)));
    maxByQ.set(q, max ?? -1);
  }

  const toInsert = [] as { user_id: number; day: string; quadrant: Quadrant; title: string; note: string | null; position: number }[];
  for (const r of src) {
    const key = `${r.quadrant}::${r.title.trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const next = (maxByQ.get(r.quadrant) ?? -1) + 1;
    maxByQ.set(r.quadrant, next);
    toInsert.push({ user_id: u, day, quadrant: r.quadrant, title: r.title, note: r.note, position: next });
  }
  if (toInsert.length) await db.insert(tasks).values(toInsert);
  return { copied: toInsert.length };
}

/* ------------------------------- utils -------------------------------- */

function addDays(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}
