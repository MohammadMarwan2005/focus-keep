import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { loadHabitList, loadMistakeCatalog } from "@/lib/habit-data";
import MistakesView from "@/components/MistakesView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "الأخطاء — يومي" };

export default async function MistakesPage({ searchParams }: { searchParams: Promise<{ habit?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const [list, catalog] = await Promise.all([loadHabitList(session.uid), loadMistakeCatalog(session.uid, null)]);
  const habits = [...list.active, ...list.archived];
  const initialHabit = /^\d+$/.test(sp.habit || "") && habits.some((h) => h.id === Number(sp.habit)) ? Number(sp.habit) : null;

  return <MistakesView name={session.name} habits={habits} initial={catalog} initialHabit={initialHabit} />;
}
