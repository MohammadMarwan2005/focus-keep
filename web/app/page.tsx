import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { loadDay } from "@/lib/data";
import { todayISO } from "@/lib/date";
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
  const today = todayISO();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.day || "") ? sp.day! : today;

  const data = await loadDay(session.uid, day);

  return (
    <DayView
      key={day}
      day={day}
      today={today}
      name={session.name}
      initialQuadrants={data.quadrants}
      initialIdeas={data.ideas}
    />
  );
}
