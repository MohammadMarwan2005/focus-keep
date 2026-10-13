"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, ChevronDown, ListChecks, Pencil, TriangleAlert } from "lucide-react";
import { unarchiveHabit } from "@/lib/habit-actions";
import { contentOf } from "@/lib/habits/bidi";
import type { EntryDTO, HabitDTO, MistakeDTO } from "@/lib/habits/dto";
import { BidiText } from "@/components/BidiField";
import HabitForm from "@/components/HabitForm";
import HabitAnalytics from "@/components/HabitAnalytics";
import HabitIcon from "@/components/HabitIcon";
import { habitSummary } from "@/components/HabitsList";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

export default function HabitDetail({
  habit,
  today,
  entries,
  mistakes,
}: {
  habit: HabitDTO;
  today: string;
  entries: EntryDTO[];
  mistakes: MistakeDTO[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const desc = contentOf(habit.description, habit.line_dirs);

  async function restore() {
    const res = await unarchiveHabit(habit.id);
    if (!res.ok) return toast.show(res.error);
    toast.show("تمت استعادة العادة");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <PageHeader
        wide
        icon={<ListChecks size={24} aria-hidden />}
        title={habit.title}
        subtitle={habitSummary(habit, today)}
        links={[
          { href: "/habits", label: "العادات", icon: <ListChecks size={16} aria-hidden /> },
          { href: `/habits/mistakes?habit=${habit.id}`, label: "الأخطاء", icon: <TriangleAlert size={16} aria-hidden /> },
        ]}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 flex flex-col gap-5">
        <section className="flex items-start gap-4">
          <HabitIcon icon={habit} size={56} />
          <div className="min-w-0 flex-1">
            <h2 dir="auto" className="font-heading text-2xl text-ink">{habit.title}</h2>
            {desc.text.trim() && <BidiText {...desc} className="text-sm text-ink-soft mt-1 leading-relaxed" />}
          </div>
        </section>

        {habit.archived && (
          <div className="rounded-xl border border-line bg-surface-2 px-4 py-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-soft">هذه العادة مؤرشفة ولا تظهر في لوحة اليوم.</span>
            <button onClick={() => void restore()} className="flex items-center gap-1.5 text-accent hover:underline">
              <ArchiveRestore size={15} aria-hidden /> استعادة
            </button>
          </div>
        )}

        <HabitAnalytics habit={habit} today={today} entries={entries} mistakes={mistakes} />

        <section className="rounded-2xl border border-line bg-surface">
          <button
            onClick={() => setEditing((o) => !o)}
            aria-expanded={editing}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-ink"
          >
            <span className="flex items-center gap-2"><Pencil size={15} aria-hidden /> تعديل العادة</span>
            <ChevronDown size={16} className={`transition ${editing ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {editing && (
            <div className="px-4 pb-4">
              <HabitForm
                initial={habit}
                today={today}
                onCancel={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  router.refresh();
                }}
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
