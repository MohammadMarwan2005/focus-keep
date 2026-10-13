"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive, ArchiveRestore, BellOff, ChevronDown, GripVertical, ListChecks, Plus, Settings2, TriangleAlert,
} from "lucide-react";
import { archiveHabit, reorderHabits, unarchiveHabit } from "@/lib/habit-actions";
import { resolveGoal } from "@/lib/habits/goals";
import type { HabitDTO } from "@/lib/habits/dto";
import HabitIcon from "@/components/HabitIcon";
import HabitForm from "@/components/HabitForm";
import Modal from "@/components/Modal";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

const fmt = (n: number) => String(Number(n.toFixed(2)));

export function habitSummary(h: HabitDTO, today: string): string {
  if (h.progress_type === "boolean") return "نعم / لا";
  const g = resolveGoal(h.goals, today) ?? h.goals[0];
  if (!g) return "قيمة مقاسة";
  return `${g.goal_direction === "at_least" ? "على الأقل" : "على الأكثر"} ${fmt(g.goal_value)}${h.unit ? ` ${h.unit}` : ""}`;
}

const rowBtn = "tap-target grid place-items-center rounded-lg bg-surface-2 border border-line text-ink-soft px-2.5 py-1.5 hover:text-accent hover:border-accent transition";

function Row({ h, today, onArchive }: { h: HabitDTO; today: string; onArchive: (h: HabitDTO) => void }) {
  const s = useSortable({ id: h.id });
  return (
    <li
      ref={s.setNodeRef}
      style={{ transform: CSS.Transform.toString(s.transform), transition: s.transition }}
      className={`rounded-2xl border border-line bg-surface p-3 flex items-center gap-3 shadow-card ${s.isDragging ? "dragging" : ""}`}
    >
      <button
        {...s.attributes}
        {...s.listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing text-ink-soft/60 hover:text-ink-soft touch-none select-none tap-target grid place-items-center"
        aria-label="اسحب لإعادة الترتيب"
      >
        <GripVertical size={16} aria-hidden />
      </button>
      <Link href={`/habits/${h.id}`} className="flex items-center gap-3 min-w-0 flex-1 group">
        <HabitIcon icon={h} size={40} />
        <div className="min-w-0">
          <p dir="auto" className="font-medium text-ink truncate group-hover:text-accent transition">{h.title}</p>
          <p className="text-xs text-ink-soft flex items-center gap-1.5">
            <span dir="auto">{habitSummary(h, today)}</span>
            {!h.reminder_enabled && <BellOff size={12} aria-label="بلا تذكير" />}
          </p>
        </div>
      </Link>
      <button onClick={() => onArchive(h)} className={rowBtn} title="أرشفة" aria-label="أرشفة">
        <Archive size={16} aria-hidden />
      </button>
    </li>
  );
}

export default function HabitsList({
  name,
  today,
  initialActive,
  initialArchived,
}: {
  name: string;
  today: string;
  initialActive: HabitDTO[];
  initialArchived: HabitDTO[];
}) {
  const toast = useToast();
  const [active, setActive] = useState(initialActive);
  // the toast's Undo runs later, so it reads the list through a ref, not a stale closure
  const activeRef = useRef(active);
  activeRef.current = active;
  const [archived, setArchived] = useState(initialArchived);
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = active.findIndex((h) => h.id === e.active.id);
    const to = active.findIndex((h) => h.id === e.over!.id);
    if (from < 0 || to < 0) return;
    // keep position in step with the server so later restores / rollbacks sort correctly
    const next = arrayMove(active, from, to).map((h, i) => ({ ...h, position: i }));
    setActive(next);
    const res = await reorderHabits(next.map((h) => h.id));
    if (!res.ok) toast.show(res.error);
  }

  /** Restore from the archive (appended), or for an Undo put it back at `undoIndex`. */
  async function restore(h: HabitDTO, undoIndex?: number) {
    const res = await unarchiveHabit(h.id);
    if (!res.ok) {
      toast.show(res.error);
      return;
    }
    setArchived((p) => p.filter((x) => x.id !== h.id));
    if (undoIndex === undefined) {
      setActive((p) => [...p.filter((x) => x.id !== h.id), res.data]);
      toast.show("تمت استعادة العادة");
      return;
    }
    const rest = activeRef.current.filter((x) => x.id !== h.id);
    rest.splice(Math.min(undoIndex, rest.length), 0, res.data);
    const order = rest.map((x, i) => ({ ...x, position: i }));
    setActive(order);
    const r = await reorderHabits(order.map((x) => x.id));
    if (!r.ok) toast.show(r.error);
  }

  async function archive(h: HabitDTO) {
    const index = active.findIndex((x) => x.id === h.id);
    setActive((p) => p.filter((x) => x.id !== h.id));
    const res = await archiveHabit(h.id);
    if (!res.ok) {
      setActive((p) => [...p, h].sort((a, b) => a.position - b.position));
      toast.show(res.error);
      return;
    }
    setArchived((p) => [{ ...h, archived: true }, ...p]);
    toast.show("تمت أرشفة العادة", { action: { label: "تراجع", onClick: () => void restore(h, index) }, duration: 5000 });
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <PageHeader
        icon={<ListChecks size={24} aria-hidden />}
        title="العادات"
        subtitle={name}
        links={[
          { href: "/habits/mistakes", label: "الأخطاء", icon: <TriangleAlert size={16} aria-hidden /> },
          { href: "/settings", label: "الإعدادات", icon: <Settings2 size={16} aria-hidden /> },
        ]}
      />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 flex flex-col gap-4">
        <button
          onClick={() => setAdding(true)}
          className="self-start flex items-center gap-1.5 rounded-full bg-accent/15 border border-accent/40 text-ink px-4 py-2 text-sm hover:bg-accent/25 transition"
        >
          <Plus size={16} aria-hidden /> عادة جديدة
        </button>

        {active.length === 0 ? (
          <div className="grid place-items-center text-center text-ink-soft py-16">
            <ListChecks size={40} className="text-ink-soft/40 mb-3" aria-hidden />
            <p className="text-sm">لا عادات بعد.</p>
            <p className="text-xs text-ink-soft/70 mt-1">أضف عادة لتتابعها يومياً من لوحة اليوم.</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={active.map((h) => h.id)} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-2.5">
                {active.map((h) => <Row key={h.id} h={h} today={today} onArchive={archive} />)}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {archived.length > 0 && (
          <section className="mt-4 rounded-2xl border border-line bg-surface-2">
            <button
              onClick={() => setShowArchived((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-ink"
              aria-expanded={showArchived}
            >
              <span className="flex items-center gap-2"><Archive size={16} aria-hidden /> المؤرشفة ({archived.length})</span>
              <ChevronDown size={16} className={`transition ${showArchived ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {showArchived && (
              <ul className="px-3 pb-3 flex flex-col gap-2">
                {archived.map((h) => (
                  <li key={h.id} className="rounded-xl border border-line bg-surface p-2.5 flex items-center gap-3 opacity-80">
                    <HabitIcon icon={h} size={32} />
                    <Link href={`/habits/${h.id}`} dir="auto" className="flex-1 min-w-0 truncate text-sm text-ink hover:text-accent">{h.title}</Link>
                    <button onClick={() => void restore(h)} className={rowBtn} title="استعادة" aria-label="استعادة">
                      <ArchiveRestore size={16} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      {adding && (
        <Modal onClose={() => setAdding(false)} labelledBy="new-habit-h">
          <div className="p-4 border-b border-line">
            <h2 id="new-habit-h" className="font-heading text-xl text-ink">عادة جديدة</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
            <HabitForm
              initial={null}
              today={today}
              onCancel={() => setAdding(false)}
              onSaved={(h) => {
                setActive((p) => [...p, h]);
                setAdding(false);
              }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
