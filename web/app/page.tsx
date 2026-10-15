import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { loadDay, loadUserTimezone } from "@/lib/data";
import { todayISOInTz } from "@/lib/date";
import { loadBoardHabits } from "@/lib/habit-data";
import type { BoardHabit } from "@/lib/habits/dto";
import { HABITS_RAIL_COOKIE } from "@/lib/habits/display";
import DayView from "@/components/DayView";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  // today in the user's zone, not the server clock's (the box runs in UTC)
  const today = todayISOInTz(await loadUserTimezone(session.uid));
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.day || "") ? sp.day! : today;

  const data = await loadDay(session.uid, day);
  // null hides the habits rail, e.g. before scripts/migrate-habits.mjs has run on this DB
  let habits: BoardHabit[] | null = null;
  try {
    habits = await loadBoardHabits(session.uid, day);
  } catch (e) {
    console.error("habits unavailable", e);
  }

  // read server-side so a collapsed rail doesn't flash open on load
  const habitsCollapsed = (await cookies()).get(HABITS_RAIL_COOKIE)?.value === "collapsed";

  return (
    <DayView
      key={day}
      day={day}
      today={today}
      name={session.name}
      initialQuadrants={data.quadrants}
      initialIdeas={data.ideas}
      initialHabits={habits}
      habitsCollapsed={habitsCollapsed}
    />
  );
}
