import "dotenv/config";
import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { db, users, habits, habit_goals, habit_entries, mistakes, entry_mistakes } from "../db";
import { addDaysISO, todayISOInTz } from "../lib/date";
import { resolveGoal } from "../lib/habits/goals";
import { evaluateEntry } from "../lib/habits/evaluate";
import type { EntryStatus, GoalVersion } from "../lib/habits/types";

/**
 * Test data for the habit tracker: user `test2` (Asia/Damascus) with five
 * habits and 60 days of entries. Usage:
 *
 *   SEED_TEST2_PASSWORD=... npm run seed:habits
 *
 * Idempotent: the user is upserted and all of test2's habit data is replaced,
 * relative to "today" in Damascus. A fixed PRNG seed makes reruns identical.
 * Needs scripts/migrate-habits.mjs to have run first.
 */

const USERNAME = "test2";
const TZ = "Asia/Damascus";
const DAYS = 60;

// mulberry32: tiny deterministic PRNG
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261013);
const between = (a: number, b: number) => Math.round((a + rand() * (b - a)) * 4) / 4; // quarter steps
const chance = (p: number) => rand() < p;

type HabitSpec = {
  key: string;
  title: string;
  description: string | null;
  emoji: string;
  bg: string;
  type: "boolean" | "measured";
  unit?: string;
  reminder: boolean;
  goals?: { value: number; dir: "at_least" | "at_most"; fromDaysAgo: number }[];
  mistakes: { text: string; suggest?: boolean }[];
};

const SPECS: HabitSpec[] = [
  {
    key: "sleep", title: "النوم", emoji: "😴", bg: "#e3e0f5", type: "measured", unit: "ساعات", reminder: true,
    description: "ساعات النوم تُحتسب للّيلة التي بدأت فيها.\nSleep counts for the night it started.",
    goals: [{ value: 8, dir: "at_least", fromDaysAgo: DAYS }, { value: 7.5, dir: "at_least", fromDaysAgo: 30 }],
    mistakes: [
      { text: "Watching reels after coming home" },
      { text: "سهرت مع الأصدقاء" },
      { text: "Caffeine after 6pm" },
      { text: "عشاء متأخر", suggest: false },
    ],
  },
  {
    key: "reading", title: "القراءة / Reading", emoji: "📖", bg: "#f8edd2", type: "measured", unit: "دقيقة", reminder: true,
    description: null,
    goals: [{ value: 30, dir: "at_least", fromDaysAgo: DAYS }],
    mistakes: [{ text: "تصفّحت الهاتف بدل القراءة" }, { text: "Too tired after work" }],
  },
  {
    key: "screen", title: "Screen time", emoji: "📱", bg: "#f6e2e5", type: "measured", unit: "hours", reminder: true,
    description: "Phone screen time from the weekly report.",
    goals: [{ value: 2, dir: "at_most", fromDaysAgo: DAYS }],
    mistakes: [{ text: "Watching reels after coming home" }, { text: "ملل في المساء" }],
  },
  {
    key: "prayer", title: "الصلاة في وقتها", emoji: "🕌", bg: "#e7efe1", type: "boolean", reminder: true,
    description: null,
    mistakes: [{ text: "نسيت الهاتف في الغرفة" }, { text: "انشغلت بالعمل" }],
  },
  {
    key: "gym", title: "Gym", emoji: "🏋️", bg: "#efe8dd", type: "boolean", reminder: false,
    description: null,
    mistakes: [{ text: "Skipped because of late meetings" }, { text: "ألم في الظهر" }],
  },
];

type Draft = { status: EntryStatus; value: number | null; mistakes: string[] };

/** One day's entry for a habit, or null to leave the day unknown. `ago` = days before today. */
function draftFor(key: string, ago: number): Draft | null {
  const skip = (): Draft => ({ status: "skipped", value: null, mistakes: [] });
  switch (key) {
    case "sleep": {
      if (ago <= 3) return null;           // yesterday and the two days before: catch-up
      if (ago === 20) return skip();       // travelling
      if (chance(0.22)) return { status: "done", value: between(5, 6.75), mistakes: ["Watching reels after coming home", ...(chance(0.25) ? ["Caffeine after 6pm"] : [])] };
      if (chance(0.08)) return { status: "done", value: between(5.25, 6.5), mistakes: ["سهرت مع الأصدقاء"] };
      if (chance(0.1)) return { status: "done", value: between(7, 7.25), mistakes: ["Caffeine after 6pm"] };  // near misses
      if (chance(0.04)) return { status: "done", value: between(6, 7), mistakes: ["عشاء متأخر"] };            // hidden row
      return { status: "done", value: between(8, 9), mistakes: [] };
    }
    case "reading": {
      if (ago >= 38 && ago <= 40) return null; // a 3-day unknown gap
      if (ago === 25 || ago === 10) return skip();
      if (chance(0.15)) return { status: "done", value: between(5, 15), mistakes: ["Too tired after work"] };
      if (chance(0.12)) return { status: "done", value: between(20, 29), mistakes: ["تصفّحت الهاتف بدل القراءة"] }; // near misses
      if (chance(0.05)) return { status: "missed", value: null, mistakes: ["Too tired after work"] };             // hard failure
      return { status: "done", value: Math.round(between(30, 55)), mistakes: [] };
    }
    case "screen": {
      if (ago >= 41) return null;          // 19 unknown days at the start: older than the catch-up window
      if (ago === 5) return skip();
      if (chance(0.3)) return { status: "done", value: between(2.75, 4.5), mistakes: ["Watching reels after coming home"] };
      if (chance(0.12)) return { status: "done", value: between(2.25, 2.5), mistakes: ["ملل في المساء"] };
      return { status: "done", value: between(1, 2), mistakes: [] };
    }
    case "prayer": {
      if (ago <= 3) return null;           // catch-up
      if (ago === 15) return skip();
      if (chance(0.82)) return { status: "done", value: null, mistakes: [] };
      return { status: "missed", value: null, mistakes: [chance(0.6) ? "نسيت الهاتف في الغرفة" : "انشغلت بالعمل"] };
    }
    case "gym": {
      if (ago === 33) return skip();
      if (chance(0.55)) return { status: "done", value: null, mistakes: [] };
      return { status: "missed", value: null, mistakes: chance(0.7) ? ["Skipped because of late meetings"] : ["ألم في الظهر"] };
    }
  }
  return null;
}

async function main() {
  const password = process.env.SEED_TEST2_PASSWORD;
  if (!password) {
    console.error("SEED_TEST2_PASSWORD is not set. Usage: SEED_TEST2_PASSWORD=... npm run seed:habits");
    process.exit(1);
  }

  const today = todayISOInTz(TZ);
  const start = addDaysISO(today, -DAYS);
  const hash = await bcrypt.hash(password, 10);

  // upsert the user
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, USERNAME));
  let uid: number;
  if (existing) {
    uid = existing.id;
    await db.update(users).set({ password_hash: hash, timezone: TZ }).where(eq(users.id, uid));
  } else {
    const [res] = await db.insert(users).values({ username: USERNAME, password_hash: hash, name: "Test 2", role: "user", timezone: TZ });
    uid = Number((res as { insertId: number }).insertId);
  }

  // replace all of test2's habit data
  await db.delete(entry_mistakes).where(eq(entry_mistakes.user_id, uid));
  await db.delete(habit_entries).where(eq(habit_entries.user_id, uid));
  await db.delete(mistakes).where(eq(mistakes.user_id, uid));
  await db.delete(habit_goals).where(eq(habit_goals.user_id, uid));
  await db.delete(habits).where(eq(habits.user_id, uid));

  let entryCount = 0;
  for (const [position, spec] of SPECS.entries()) {
    const [res] = await db.insert(habits).values({
      user_id: uid, title: spec.title, description: spec.description,
      icon_type: "emoji", emoji: spec.emoji, bg_color: spec.bg,
      progress_type: spec.type, unit: spec.unit ?? null, reminder_enabled: spec.reminder,
      start_date: start, position,
    });
    const habitId = Number((res as { insertId: number }).insertId);

    const goals: GoalVersion[] = (spec.goals ?? []).map((g) => ({
      goal_value: g.value, goal_direction: g.dir, effective_from: addDaysISO(today, -g.fromDaysAgo),
    }));
    if (goals.length) await db.insert(habit_goals).values(goals.map((g) => ({ user_id: uid, habit_id: habitId, ...g })));

    const mistakeIds = new Map<string, number>();
    for (const m of spec.mistakes) {
      const [r] = await db.insert(mistakes).values({ user_id: uid, habit_id: habitId, text: m.text, suggest: m.suggest ?? true });
      mistakeIds.set(m.text, Number((r as { insertId: number }).insertId));
    }

    const rows: { day: string; d: Draft }[] = [];
    for (let ago = DAYS; ago >= 1; ago--) {
      const d = draftFor(spec.key, ago);
      if (d) rows.push({ day: addDaysISO(today, -ago), d });
    }
    if (!rows.length) continue;
    await db.insert(habit_entries).values(rows.map(({ day, d }) => ({
      user_id: uid, habit_id: habitId, day, status: d.status, value: d.value,
    })));
    entryCount += rows.length;

    // mistakes go on failure days only, so the correlation chart has a clear signal
    const saved = await db
      .select({ id: habit_entries.id, day: habit_entries.day })
      .from(habit_entries)
      .where(and(eq(habit_entries.user_id, uid), eq(habit_entries.habit_id, habitId), inArray(habit_entries.day, rows.map((r) => r.day))));
    const idByDay = new Map(saved.map((s) => [s.day, s.id]));
    const links: { user_id: number; entry_id: number; mistake_id: number }[] = [];
    for (const { day, d } of rows) {
      const outcome = evaluateEntry(spec.type, d, resolveGoal(goals, day)).outcome;
      if (outcome !== "failure") continue;
      for (const text of d.mistakes) {
        links.push({ user_id: uid, entry_id: idByDay.get(day)!, mistake_id: mistakeIds.get(text)! });
      }
    }
    if (links.length) await db.insert(entry_mistakes).values(links);
    console.log(`  ${spec.title}: ${rows.length} entries, ${links.length} mistake links`);
  }

  console.log(`seeded "${USERNAME}" (id ${uid}, ${TZ}): ${SPECS.length} habits, ${entryCount} entries, today = ${today}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
