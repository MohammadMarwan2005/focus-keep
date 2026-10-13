"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, NotebookPen, Lightbulb, MoreVertical, ArrowLeftRight } from "lucide-react";
import Menu, { type MenuItem } from "@/components/Menu";

export type Item = {
  uid: string;        // dnd id, e.g. "task:12" or "idea:3"
  kind: "task" | "idea";
  dbId: number;
  title: string;
  note: string | null;
  lineDirs?: string | null;
  done: boolean;
};

export type MoveOption = { label: string; quadrant: string };

const gripCls =
  "shrink-0 cursor-grab active:cursor-grabbing text-ink-soft/60 hover:text-ink-soft touch-none select-none tap-target grid place-items-center";
const rowBtnCls =
  "tap-target grid place-items-center rounded-lg text-ink-soft hover:text-accent hover:bg-surface-2 transition";

function Grip(props: React.HTMLAttributes<HTMLButtonElement> & { attributes?: object; listeners?: object }) {
  const { attributes, listeners, ...rest } = props;
  return (
    <button {...attributes} {...listeners} {...rest} className={gripCls} aria-label="اسحب" tabIndex={-1}>
      <GripVertical size={16} aria-hidden />
    </button>
  );
}

/* ------------------------------ task card ----------------------------- */

export function TaskCard({
  item,
  onToggle,
  onDelete,
  onRename,
  onOpenNote,
  onMoveQuadrant,
  onMoveToIdeas,
  moveOptions,
  overlay,
}: {
  item: Item;
  onToggle?: (uid: string) => void;
  onDelete?: (uid: string) => void;
  onRename?: (uid: string, title: string) => void;
  onOpenNote?: (dbId: number) => void;
  onMoveQuadrant?: (uid: string, quadrant: string) => void;
  onMoveToIdeas?: (uid: string) => void;
  moveOptions?: MoveOption[];
  overlay?: boolean;
}) {
  const sortable = useSortable({ id: item.uid, disabled: overlay });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);

  const style = overlay
    ? undefined
    : { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };

  const menuItems: MenuItem[] = [
    // on touch the row has no notepad button (N3) — reach it from here instead
    { label: item.note ? "افتح الملاحظة" : "افتح في المفكرة", icon: <NotebookPen size={15} />, onClick: () => onOpenNote?.(item.dbId) },
    ...(moveOptions ?? []).map((o) => ({
      label: `نقل إلى ${o.label}`,
      icon: <ArrowLeftRight size={15} />,
      onClick: () => onMoveQuadrant?.(item.uid, o.quadrant),
    })),
    { label: "إلى الأفكار", icon: <Lightbulb size={15} />, onClick: () => onMoveToIdeas?.(item.uid) },
    { label: "حذف", icon: <Trash2 size={15} />, danger: true, onClick: () => onDelete?.(item.uid) },
  ];

  return (
    <div
      ref={overlay ? undefined : sortable.setNodeRef}
      style={style}
      className={`group flex items-center gap-1.5 rounded-xl bg-surface border border-line px-2 py-1.5 shadow-card ${
        sortable.isDragging ? "dragging" : ""
      } ${overlay ? "shadow-pop rotate-1" : ""}`}
    >
      <Grip attributes={overlay ? undefined : sortable.attributes} listeners={overlay ? undefined : sortable.listeners} />

      <label className="tap-target grid place-items-center cursor-pointer shrink-0">
        <input
          type="checkbox"
          checked={item.done}
          onChange={() => onToggle?.(item.uid)}
          className="size-5 accent-[var(--accent)]"
          aria-label="تم"
        />
      </label>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            dir="auto"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (draft.trim() && draft !== item.title) onRename?.(item.uid, draft.trim());
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") { setDraft(item.title); setEditing(false); }
            }}
            className="w-full bg-transparent text-ink text-sm outline-none border-b border-line"
          />
        ) : (
          <p
            dir="auto"
            onDoubleClick={() => { setDraft(item.title); setEditing(true); }}
            title="نقر مزدوج لتعديل العنوان"
            className={`text-sm leading-snug break-words ${item.done ? "line-through text-ink-soft" : "text-ink"}`}
          >
            {item.title}
          </p>
        )}
      </div>

      {/* on touch this lives in the ⋮ menu instead (N3) — keeps the title from wrapping */}
      <button
        onClick={() => onOpenNote?.(item.dbId)}
        className={`hide-on-touch opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${rowBtnCls} ${
          item.note ? "text-accent opacity-100" : ""
        }`}
        aria-label="افتح في المفكرة"
        title={item.note ? "له ملاحظة — افتح في المفكرة" : "افتح في المفكرة"}
      >
        <NotebookPen size={16} aria-hidden />
      </button>

      <Menu
        items={menuItems}
        triggerLabel="خيارات"
        triggerClassName={`tap-visible opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${rowBtnCls}`}
      >
        <MoreVertical size={16} aria-hidden />
      </Menu>
    </div>
  );
}

/* ------------------------------ idea card ----------------------------- */

export function IdeaCard({
  item,
  onDelete,
  onOpen,
  onMoveQuadrant,
  moveOptions,
  overlay,
}: {
  item: Item;
  onDelete?: (uid: string) => void;
  onOpen?: (dbId: number) => void;
  onMoveQuadrant?: (uid: string, quadrant: string) => void;
  moveOptions?: MoveOption[];
  overlay?: boolean;
}) {
  const sortable = useSortable({ id: item.uid, disabled: overlay });
  const style = overlay
    ? undefined
    : { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };

  const menuItems: MenuItem[] = [
    { label: "افتح في المفكرة", icon: <NotebookPen size={15} />, onClick: () => onOpen?.(item.dbId) },
    ...(moveOptions ?? []).map((o) => ({
      label: `نقل إلى ${o.label}`,
      icon: <ArrowLeftRight size={15} />,
      onClick: () => onMoveQuadrant?.(item.uid, o.quadrant),
    })),
    { label: "حذف", icon: <Trash2 size={15} />, danger: true, onClick: () => onDelete?.(item.uid) },
  ];

  return (
    <div
      ref={overlay ? undefined : sortable.setNodeRef}
      style={style}
      {...(overlay ? {} : sortable.attributes)}
      {...(overlay ? {} : sortable.listeners)}
      onDoubleClick={() => onOpen?.(item.dbId)}
      title="نقر مزدوج للفتح في المفكرة"
      className={`group flex items-center gap-1.5 rounded-xl bg-surface border border-line px-2 py-1.5 shadow-card cursor-grab active:cursor-grabbing touch-none ${
        sortable.isDragging ? "dragging" : ""
      } ${overlay ? "shadow-pop -rotate-1" : ""}`}
    >
      <span className="text-accent-2 shrink-0 grid place-items-center"><Lightbulb size={16} aria-hidden /></span>
      <p dir="auto" className="min-w-0 flex-1 text-sm leading-snug text-ink break-words">{item.title}</p>
      <Menu
        items={menuItems}
        triggerLabel="خيارات"
        stopPointer
        triggerClassName={`tap-visible opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${rowBtnCls}`}
      >
        <MoreVertical size={16} aria-hidden />
      </Menu>
    </div>
  );
}
