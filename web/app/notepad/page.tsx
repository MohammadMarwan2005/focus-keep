import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { loadNotes, loadTaskNote } from "@/lib/data";
import Notepad from "@/components/Notepad";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "المفكرة — يومي" };

export default async function NotepadPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; task?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const openId = /^\d+$/.test(sp.open || "") ? Number(sp.open) : null;
  const taskId = /^\d+$/.test(sp.task || "") ? Number(sp.task) : null;
  const notes = await loadNotes(session.uid);
  const initialTask = taskId ? await loadTaskNote(session.uid, taskId) : null;

  return (
    <Notepad
      name={session.name}
      initialNotes={notes}
      openId={openId}
      initialTask={initialTask}
      uid={session.uid}
    />
  );
}
