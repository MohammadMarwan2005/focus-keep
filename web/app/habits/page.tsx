import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { loadUserTimezone } from "@/lib/data";
import { todayISOInTz } from "@/lib/date";
import { loadHabitList } from "@/lib/habit-data";
import HabitsList from "@/components/HabitsList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "العادات — يومي" };

export default async function HabitsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [list, tz] = await Promise.all([loadHabitList(session.uid), loadUserTimezone(session.uid)]);

  return (
    <HabitsList
      name={session.name}
      today={todayISOInTz(tz)}
      initialActive={list.active}
      initialArchived={list.archived}
    />
  );
}
