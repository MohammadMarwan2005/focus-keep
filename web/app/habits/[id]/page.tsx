import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { loadUserTimezone } from "@/lib/data";
import { todayISOInTz } from "@/lib/date";
import { loadHabit, loadHabitAnalytics } from "@/lib/habit-data";
import HabitDetail from "@/components/HabitDetail";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "العادة — يومي" };

export default async function HabitPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const habit = await loadHabit(session.uid, Number(id));
  if (!habit) notFound();

  const [tz, analytics] = await Promise.all([
    loadUserTimezone(session.uid),
    loadHabitAnalytics(session.uid, habit.id),
  ]);

  return (
    <HabitDetail
      key={habit.id}
      habit={habit}
      today={todayISOInTz(tz)}
      entries={analytics.entries}
      mistakes={analytics.mistakes}
    />
  );
}
