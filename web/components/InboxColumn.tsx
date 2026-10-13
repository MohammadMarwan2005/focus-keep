"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Lightbulb, Plus } from "lucide-react";
import { IdeaCard, type Item, type MoveOption } from "@/components/cards";
import { QUADRANT_META } from "@/lib/quadrants";

export default function InboxColumn({
  items,
  onAdd,
  onDelete,
  onOpen,
  onMoveQuadrant,
}: {
  items: Item[];
  onAdd: (title: string) => void;
  onDelete: (uid: string) => void;
  onOpen: (dbId: number) => void;
  onMoveQuadrant: (uid: string, quadrant: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "inbox" });
  const [draft, setDraft] = useState("");

  // an idea can move into any of the four quadrants
  const moveOptions: MoveOption[] = QUADRANT_META.map((m) => ({ label: m.title, quadrant: m.key }));

  function add() {
    const t = draft.trim();
    if (!t) {
      setDraft("");
      return;
    }
    onAdd(t);
    setDraft("");
  }

  return (
    <section
      className={`flex flex-col min-w-0 lg:h-full rounded-2xl border border-line bg-surface-2 p-3 transition ${
        isOver ? "ring-2 ring-accent-2/60" : ""
      }`}
    >
      <header className="flex items-baseline justify-between gap-2 mb-2 px-1">
        <h2 className="font-heading text-lg text-ink flex items-center gap-2">
          <Lightbulb size={18} className="text-accent-2" aria-hidden /> أفكار
        </h2>
        <span className="text-xs text-ink-soft shrink-0">اسحبها إلى اليوم</span>
      </header>

      <div ref={setNodeRef} className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2">
        <SortableContext items={items.map((i) => i.uid)} strategy={verticalListSortingStrategy}>
          {items.map((it) => (
            <IdeaCard
              key={it.uid}
              item={it}
              onDelete={onDelete}
              onOpen={onOpen}
              onMoveQuadrant={onMoveQuadrant}
              moveOptions={moveOptions}
            />
          ))}
        </SortableContext>
        {items.length === 0 && (
          <div className="flex-1 grid place-items-center text-ink-soft/70 text-sm py-3">
            دوّن فكرة لوقتٍ لاحق
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1">
        <input
          value={draft}
          dir="auto"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="فكرة جديدة…"
          className="flex-1 min-w-0 rounded-lg bg-surface border border-line px-2.5 py-1.5 text-base sm:text-sm text-ink outline-none focus:border-accent-2 placeholder:text-ink-soft/60"
        />
        <button
          onClick={add}
          className="shrink-0 tap-target grid place-items-center size-9 rounded-lg bg-surface border border-line text-ink-soft hover:text-accent-2 hover:border-accent-2 transition"
          aria-label="إضافة فكرة"
        >
          <Plus size={18} aria-hidden />
        </button>
      </div>
    </section>
  );
}
