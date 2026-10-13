"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { TaskCard, type Item, type MoveOption } from "@/components/cards";
import { QUADRANT_META, type QuadrantMeta } from "@/lib/quadrants";

export default function Column({
  meta,
  items,
  onAdd,
  onToggle,
  onDelete,
  onRename,
  onOpenNote,
  onMoveQuadrant,
  onMoveToIdeas,
}: {
  meta: QuadrantMeta;
  items: Item[];
  onAdd: (title: string) => void;
  onToggle: (uid: string) => void;
  onDelete: (uid: string) => void;
  onRename: (uid: string, title: string) => void;
  onOpenNote: (dbId: number) => void;
  onMoveQuadrant: (uid: string, quadrant: string) => void;
  onMoveToIdeas: (uid: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: meta.key });
  const [draft, setDraft] = useState("");

  // move targets = the other three quadrants
  const moveOptions: MoveOption[] = QUADRANT_META.filter((m) => m.key !== meta.key).map((m) => ({
    label: m.title,
    quadrant: m.key,
  }));

  function add() {
    const t = draft.trim();
    if (!t) {
      setDraft(""); // clear whitespace-only input so the placeholder returns
      return;
    }
    onAdd(t);
    setDraft("");
  }

  const remaining = items.filter((i) => !i.done).length;

  return (
    <section
      className={`flex flex-col min-w-0 rounded-2xl border border-line ${meta.bg} p-3 min-h-[9rem] transition ${
        isOver ? "ring-2 ring-accent/60" : ""
      }`}
    >
      <header className="flex items-baseline justify-between gap-2 mb-2 px-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="size-2.5 rounded-full shrink-0" style={{ background: meta.dot }} />
          <h2 className={`font-heading text-lg ${meta.ink} truncate`}>{meta.title}</h2>
        </div>
        <span className={`text-xs ${meta.ink} opacity-80 shrink-0`}>{meta.hint}</span>
      </header>

      <div ref={setNodeRef} className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2">
        <SortableContext items={items.map((i) => i.uid)} strategy={verticalListSortingStrategy}>
          {items.map((it) => (
            <TaskCard
              key={it.uid}
              item={it}
              onToggle={onToggle}
              onDelete={onDelete}
              onRename={onRename}
              onOpenNote={onOpenNote}
              onMoveQuadrant={onMoveQuadrant}
              onMoveToIdeas={onMoveToIdeas}
              moveOptions={moveOptions}
            />
          ))}
        </SortableContext>

        {items.length === 0 && (
          <div className="flex-1 grid place-items-center text-ink-soft/70 text-sm py-4">
            <span className="animate-float-soft">لا مهام بعد</span>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1">
        <input
          value={draft}
          dir="auto"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="أضف مهمة…"
          className="flex-1 min-w-0 rounded-lg bg-surface/70 border border-line px-2.5 py-1.5 text-base sm:text-sm text-ink outline-none focus:border-accent placeholder:text-ink-soft/60"
        />
        <button
          onClick={add}
          className="shrink-0 tap-target grid place-items-center size-9 rounded-lg bg-surface border border-line text-ink-soft hover:text-accent hover:border-accent transition"
          aria-label="إضافة مهمة"
        >
          <Plus size={18} aria-hidden />
        </button>
      </div>

      {remaining > 0 && items.length > 0 && (
        <p className="text-xs text-ink-soft mt-1 px-1">{remaining} متبقّية</p>
      )}
    </section>
  );
}
