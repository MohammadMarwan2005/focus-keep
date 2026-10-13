"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, ArrowRight, ArchiveRestore, Trash2, NotebookPen } from "lucide-react";
import type { NoteRow } from "@/lib/data";
import { unarchiveIdea, archiveIdea, deleteIdea, restoreIdea } from "@/lib/actions";
import { useToast } from "@/components/Toast";

/* Mirrors the notepad's saved-notes list, but for archived notes: each row can
 * be restored back into the active notes, or deleted permanently. Both actions
 * are undoable via the toast. */
export default function ArchivedList({
  name,
  initial,
}: {
  name: string;
  initial: NoteRow[];
}) {
  const toast = useToast();
  const [notes, setNotes] = useState<NoteRow[]>(initial);

  async function restore(n: NoteRow) {
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
    await unarchiveIdea(n.id);
    toast.show("تمت الاستعادة إلى ملاحظاتك", {
      action: {
        label: "تراجع",
        onClick: async () => {
          await archiveIdea(n.id);
          setNotes((prev) => [n, ...prev]);
        },
      },
      duration: 5000,
    });
  }

  async function remove(n: NoteRow) {
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
    await deleteIdea(n.id);
    toast.show("تم الحذف نهائياً", {
      action: {
        label: "تراجع",
        onClick: async () => {
          const res = await restoreIdea({ title: n.title, note: n.note, line_dirs: n.line_dirs, position: 0, archived: true });
          if (!res) return;
          setNotes((prev) => [{ ...n, id: res.id }, ...prev]);
        },
      },
      duration: 5000,
    });
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="sticky top-0 z-30 backdrop-blur bg-bg/80 border-b border-line">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Archive size={24} className="text-accent" aria-hidden />
            <div className="leading-tight">
              <h1 className="font-heading text-xl text-ink">الأرشيف</h1>
              <p className="text-[11px] text-ink-soft -mt-0.5">{name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/notepad"
              className="flex items-center gap-1.5 rounded-full bg-surface-2 border border-line text-ink px-3 py-2 text-sm hover:border-accent transition whitespace-nowrap"
            >
              <NotebookPen size={16} aria-hidden /> <span className="hidden sm:inline">المفكرة</span>
            </Link>
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-full bg-surface-2 border border-line text-ink px-3 py-2 text-sm hover:border-accent transition whitespace-nowrap"
            >
              يومي <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        {notes.length === 0 ? (
          <div className="grid place-items-center text-center text-ink-soft py-20">
            <Archive size={40} className="text-ink-soft/40 mb-3" aria-hidden />
            <p className="text-sm">لا ملاحظات مؤرشفة.</p>
            <p className="text-xs text-ink-soft/70 mt-1">أرشِف ملاحظة من المفكرة لتجدها هنا.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((n) => (
              <li
                key={n.id}
                className="rounded-2xl border border-line bg-surface p-4 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <h2 dir="auto" className="font-heading text-ink truncate">{n.title}</h2>
                  {n.note?.trim() && (
                    <p dir="auto" className="text-sm text-ink-soft mt-1 line-clamp-3 whitespace-pre-wrap break-words">
                      {n.note}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => void restore(n)}
                    className="tap-target grid place-items-center rounded-lg bg-surface-2 border border-line text-ink-soft px-2.5 py-1.5 hover:text-accent hover:border-accent transition"
                    title="استعادة"
                    aria-label="استعادة"
                  >
                    <ArchiveRestore size={16} aria-hidden />
                  </button>
                  <button
                    onClick={() => void remove(n)}
                    className="tap-target grid place-items-center rounded-lg bg-surface-2 border border-line text-ink-soft px-2.5 py-1.5 hover:text-q-do-ink hover:border-q-do-ink transition"
                    title="حذف نهائي"
                    aria-label="حذف نهائي"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
