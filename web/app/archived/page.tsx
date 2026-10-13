import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { loadArchivedNotes } from "@/lib/data";
import ArchivedList from "@/components/ArchivedList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "الأرشيف — يومي" };

export default async function ArchivedPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const notes = await loadArchivedNotes(session.uid);

  return <ArchivedList name={session.name} initial={notes} />;
}
