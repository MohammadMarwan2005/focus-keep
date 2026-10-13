"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, closestCorners,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  CloudSun, NotebookPen, CopyPlus, LogOut, MoreVertical, SunMoon,
  Music, Volume2, VolumeX, ChevronDown, ListChecks, Settings2,
} from "lucide-react";

import { QUADRANTS, type Quadrant } from "@/db/schema";
import { QUADRANT_META } from "@/lib/quadrants";
import { addDaysISO } from "@/lib/date";
import { toggleDark } from "@/lib/theme";
import type { TaskRow, IdeaRow } from "@/lib/data";
import { useSound } from "@/components/SoundManager";
import { useToast } from "@/components/Toast";
import Menu, { type MenuItem } from "@/components/Menu";
import SoundMenu from "@/components/SoundMenu";
import ThemeToggle from "@/components/ThemeToggle";
import { TaskCard, IdeaCard, type Item } from "@/components/cards";
import Column from "@/components/Column";
import InboxColumn from "@/components/InboxColumn";
import DayNav from "@/components/DayNav";
import CopyYesterdayModal from "@/components/CopyYesterdayModal";
import HabitsRail from "@/components/HabitsRail";
import type { BoardHabit } from "@/lib/habits/dto";
import {
  addTask, addIdea, setDone, updateTask, updateIdea, deleteTask, deleteIdea,
  reorderQuadrant, reorderIdeas, moveTaskToDay, taskToIdea, ideaToTask,
  restoreTask, restoreIdea,
} from "@/lib/actions";

type Cols = Record<string, Item[]>; // keys: quadrants + "inbox"

type TaskSnap = { day: string; quadrant: Quadrant; title: string; note: string | null; lineDirs: string | null; done: boolean; position: number };
type IdeaSnap = { title: string; note: string | null; lineDirs: string | null; position: number };
type UndoEntry =
  | { kind: "task"; index: number; container: Quadrant; snap: TaskSnap }
  | { kind: "idea"; index: number; snap: IdeaSnap };

function build(quadrants: Record<Quadrant, TaskRow[]>, ideas: IdeaRow[]): Cols {
  const cols: Cols = {};
  for (const q of QUADRANTS) {
    cols[q] = (quadrants[q] ?? []).map((t) => ({
      uid: `task:${t.id}`, kind: "task", dbId: t.id, title: t.title, note: t.note, lineDirs: t.line_dirs, done: !!t.done,
    }));
  }
  cols.inbox = ideas.map((i) => ({
    uid: `idea:${i.id}`, kind: "idea", dbId: i.id, title: i.title, note: i.note, lineDirs: i.line_dirs, done: false,
  }));
  return cols;
}

export default function DayView({
  day, today, name, initialQuadrants, initialIdeas, initialHabits,
}: {
  day: string;
  today: string;
  name: string;
  initialQuadrants: Record<Quadrant, TaskRow[]>;
  initialIdeas: IdeaRow[];
  /** null when the habit tables aren't available — the rail is hidden */
  initialHabits: BoardHabit[] | null;
}) {
  const router = useRouter();
  const { chime, whoosh, tick } = useSound();
  const { muted, toggleMute } = useSound();
  const toast = useToast();
  const [cols, setCols] = useState<Cols>(() => build(initialQuadrants, initialIdeas));
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [showCopy, setShowCopy] = useState(false);

  const tmpId = useRef(0);
  const undoStack = useRef<UndoEntry[]>([]);
  const sortTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  // resync when the server sends fresh data (day change / explicit refresh)
  useEffect(() => {
    setCols(build(initialQuadrants, initialIdeas));
  }, [initialQuadrants, initialIdeas]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const containerOf = (uid: string): string | null => {
    for (const key of Object.keys(cols)) if (cols[key].some((i) => i.uid === uid)) return key;
    return null;
  };
  const findItem = (uid: string): Item | undefined => {
    for (const key of Object.keys(cols)) {
      const it = cols[key].find((i) => i.uid === uid);
      if (it) return it;
    }
  };

  const activeItem = activeUid ? findItem(activeUid) : null;

  /* ------------------------------ undo -------------------------------- */
  const restoreLast = useCallback(async () => {
    const e = undoStack.current.pop();
    if (!e) return;
    if (e.kind === "task") {
      const res = await restoreTask({
        day: e.snap.day, quadrant: e.snap.quadrant, title: e.snap.title,
        note: e.snap.note, line_dirs: e.snap.lineDirs, done: e.snap.done, position: e.snap.position,
      });
      if (!res) return;
      const item: Item = { uid: `task:${res.id}`, kind: "task", dbId: res.id, title: e.snap.title, note: e.snap.note, lineDirs: e.snap.lineDirs, done: e.snap.done };
      setCols((p) => {
        const list = [...(p[e.container] ?? [])];
        list.splice(Math.min(e.index, list.length), 0, item);
        return { ...p, [e.container]: list };
      });
    } else {
      const res = await restoreIdea({ title: e.snap.title, note: e.snap.note, line_dirs: e.snap.lineDirs, position: e.snap.position });
      if (!res) return;
      const item: Item = { uid: `idea:${res.id}`, kind: "idea", dbId: res.id, title: e.snap.title, note: e.snap.note, lineDirs: e.snap.lineDirs, done: false };
      setCols((p) => {
        const list = [...p.inbox];
        list.splice(Math.min(e.index, list.length), 0, item);
        return { ...p, inbox: list };
      });
    }
    tick();
  }, [tick]);

  const offerUndo = useCallback(
    (msg: string) => {
      const touch = typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;
      if (touch) toast.show(msg, { action: { label: "تراجع", onClick: () => void restoreLast() }, duration: 5000 });
    },
    [toast, restoreLast],
  );

  // Ctrl/Cmd+Z restores the last delete on desktop (skipped while typing)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
        if (undoStack.current.length) {
          e.preventDefault();
          void restoreLast();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [restoreLast]);

  /* ------------------------------ handlers ---------------------------- */
  async function handleAddTask(q: Quadrant, title: string) {
    const tempUid = `tmp:${++tmpId.current}`;
    setCols((p) => ({ ...p, [q]: [...p[q], { uid: tempUid, kind: "task", dbId: -1, title, note: null, lineDirs: null, done: false }] }));
    tick();
    const res = await addTask(day, q, title);
    if (res) setCols((p) => ({ ...p, [q]: p[q].map((i) => (i.uid === tempUid ? { ...i, uid: `task:${res.id}`, dbId: res.id } : i)) }));
    else {
      setCols((p) => ({ ...p, [q]: p[q].filter((i) => i.uid !== tempUid) }));
      toast.show("تعذّر حفظ المهمة");
    }
  }

  async function handleAddIdea(title: string) {
    const tempUid = `tmp:${++tmpId.current}`;
    setCols((p) => ({ ...p, inbox: [{ uid: tempUid, kind: "idea", dbId: -1, title, note: null, lineDirs: null, done: false }, ...p.inbox] }));
    tick();
    const res = await addIdea(title);
    if (res) setCols((p) => ({ ...p, inbox: p.inbox.map((i) => (i.uid === tempUid ? { ...i, uid: `idea:${res.id}`, dbId: res.id } : i)) }));
    else {
      setCols((p) => ({ ...p, inbox: p.inbox.filter((i) => i.uid !== tempUid) }));
      toast.show("تعذّر حفظ الفكرة");
    }
  }

  function handleToggle(uid: string) {
    const c = containerOf(uid);
    if (!c || c === "inbox") return;
    const item = cols[c].find((i) => i.uid === uid)!;
    const nextDone = !item.done;
    // flip in place first — the row stays put so the next click isn't hijacked
    setCols((p) => ({ ...p, [c]: p[c].map((i) => (i.uid === uid ? { ...i, done: nextDone } : i)) }));
    if (nextDone) chime();
    void setDone(item.dbId, nextDone);
    // then, after a beat, let finished tasks sink to the bottom (stable sort)
    if (sortTimers.current[c]) clearTimeout(sortTimers.current[c]);
    sortTimers.current[c] = setTimeout(() => {
      setCols((p) => ({ ...p, [c]: [...p[c]].sort((a, b) => Number(a.done) - Number(b.done)) }));
    }, 900);
  }

  function handleRename(uid: string, title: string) {
    const item = findItem(uid);
    if (!item) return;
    setCols((p) => {
      const out: Cols = {};
      for (const k of Object.keys(p)) out[k] = p[k].map((i) => (i.uid === uid ? { ...i, title } : i));
      return out;
    });
    if (item.kind === "task") void updateTask(item.dbId, { title });
    else void updateIdea(item.dbId, { title });
  }

  function handleDeleteTask(uid: string) {
    const c = containerOf(uid);
    if (!c || c === "inbox") return;
    const idx = cols[c].findIndex((i) => i.uid === uid);
    const item = cols[c][idx];
    if (!item) return;
    setCols((p) => ({ ...p, [c]: p[c].filter((i) => i.uid !== uid) }));
    void deleteTask(item.dbId);
    undoStack.current.push({
      kind: "task", index: idx, container: c as Quadrant,
      snap: { day, quadrant: c as Quadrant, title: item.title, note: item.note, lineDirs: item.lineDirs ?? null, done: item.done, position: idx },
    });
    offerUndo("تم حذف المهمة");
  }

  function handleDeleteIdea(uid: string) {
    const idx = cols.inbox.findIndex((i) => i.uid === uid);
    const item = cols.inbox[idx];
    if (!item) return;
    setCols((p) => ({ ...p, inbox: p.inbox.filter((i) => i.uid !== uid) }));
    void deleteIdea(item.dbId);
    undoStack.current.push({ kind: "idea", index: idx, snap: { title: item.title, note: item.note, lineDirs: item.lineDirs ?? null, position: idx } });
    offerUndo("تم حذف الفكرة");
  }

  /* ------------------------- tap-move (no drag) ----------------------- */
  async function handleMoveTaskToQuadrant(uid: string, quadrant: string) {
    const q = quadrant as Quadrant;
    const fromC = containerOf(uid);
    if (!fromC || fromC === "inbox" || fromC === q) return;
    const item = cols[fromC].find((i) => i.uid === uid);
    if (!item) return;
    const dst = [...cols[q], item];
    setCols((p) => ({ ...p, [fromC]: p[fromC].filter((i) => i.uid !== uid), [q]: dst }));
    tick();
    await reorderQuadrant(day, q, dst.map((i) => i.dbId));
  }

  async function handleMoveTaskToIdeas(uid: string) {
    const fromC = containerOf(uid);
    if (!fromC || fromC === "inbox") return;
    const item = cols[fromC].find((i) => i.uid === uid);
    if (!item) return;
    const res = await taskToIdea(item.dbId);
    if (!res) return;
    const newItem: Item = { uid: `idea:${res.id}`, kind: "idea", dbId: res.id, title: item.title, note: item.note, lineDirs: item.lineDirs, done: false };
    setCols((p) => ({ ...p, [fromC]: p[fromC].filter((i) => i.uid !== uid), inbox: [newItem, ...p.inbox] }));
    tick();
  }

  async function handleMoveIdeaToQuadrant(uid: string, quadrant: string) {
    const q = quadrant as Quadrant;
    const item = cols.inbox.find((i) => i.uid === uid);
    if (!item) return;
    const res = await ideaToTask(item.dbId, day, q);
    if (!res) return;
    const newItem: Item = { uid: `task:${res.id}`, kind: "task", dbId: res.id, title: item.title, note: item.note, lineDirs: item.lineDirs, done: false };
    const dst = [...cols[q], newItem];
    setCols((p) => ({ ...p, inbox: p.inbox.filter((i) => i.uid !== uid), [q]: dst }));
    tick();
    await reorderQuadrant(day, q, dst.map((i) => i.dbId));
  }

  const handleOpenTaskNote = (dbId: number) => router.push(`/notepad?task=${dbId}`);
  const handleOpenIdeaNote = (dbId: number) => router.push(`/notepad?open=${dbId}`);

  /* ------------------------------ drag -------------------------------- */
  function onDragStart(e: DragStartEvent) {
    setActiveUid(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    setActiveUid(null);
    if (!overId) return;

    const fromC = containerOf(activeId);
    if (!fromC) return;
    const item = cols[fromC].find((i) => i.uid === activeId)!;

    if (overId === "goto:prev" || overId === "goto:next") {
      if (item.kind !== "task") return;
      const targetDay = addDaysISO(day, overId === "goto:next" ? 1 : -1);
      setCols((p) => ({ ...p, [fromC]: p[fromC].filter((i) => i.uid !== activeId) }));
      whoosh();
      await moveTaskToDay(item.dbId, targetDay);
      return;
    }

    const toC = cols[overId] !== undefined ? overId : containerOf(overId);
    if (!toC) return;

    const toList = cols[toC];
    let newIndex = overId === toC ? toList.length : toList.findIndex((i) => i.uid === overId);
    if (newIndex < 0) newIndex = toList.length;

    const fromInbox = fromC === "inbox";
    const toInbox = toC === "inbox";

    if (fromC === toC) {
      const oldIndex = cols[fromC].findIndex((i) => i.uid === activeId);
      if (oldIndex === newIndex || oldIndex < 0) return;
      const reordered = arrayMove(cols[fromC], oldIndex, newIndex);
      setCols((p) => ({ ...p, [fromC]: reordered }));
      if (fromInbox) await reorderIdeas(reordered.map((i) => i.dbId));
      else await reorderQuadrant(day, fromC as Quadrant, reordered.map((i) => i.dbId));
      return;
    }

    if (!fromInbox && !toInbox) {
      const src = cols[fromC].filter((i) => i.uid !== activeId);
      const dst = [...cols[toC]];
      dst.splice(newIndex, 0, item);
      setCols((p) => ({ ...p, [fromC]: src, [toC]: dst }));
      tick();
      await reorderQuadrant(day, toC as Quadrant, dst.map((i) => i.dbId));
      return;
    }

    if (fromInbox && !toInbox) {
      const res = await ideaToTask(item.dbId, day, toC as Quadrant);
      if (!res) return;
      const newItem: Item = { uid: `task:${res.id}`, kind: "task", dbId: res.id, title: item.title, note: item.note, lineDirs: item.lineDirs, done: false };
      const src = cols.inbox.filter((i) => i.uid !== activeId);
      const dst = [...cols[toC]];
      dst.splice(newIndex, 0, newItem);
      setCols((p) => ({ ...p, inbox: src, [toC]: dst }));
      tick();
      await reorderQuadrant(day, toC as Quadrant, dst.map((i) => i.dbId));
      return;
    }

    if (!fromInbox && toInbox) {
      const res = await taskToIdea(item.dbId);
      if (!res) return;
      const newItem: Item = { uid: `idea:${res.id}`, kind: "idea", dbId: res.id, title: item.title, note: item.note, lineDirs: item.lineDirs, done: false };
      const src = cols[fromC].filter((i) => i.uid !== activeId);
      const dst = [...cols.inbox];
      dst.splice(newIndex, 0, newItem);
      setCols((p) => ({ ...p, [fromC]: src, inbox: dst }));
      tick();
      await reorderIdeas(dst.map((i) => i.dbId));
      return;
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  async function onThemeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/theme-music", { method: "POST", body: fd });
    toast.show(res.ok ? "تم رفع نغمة الخلفية" : "تعذّر رفع النغمة");
    e.target.value = "";
  }

  const orderedMeta = useMemo(() => QUADRANT_META, []);

  const mobileMenu: MenuItem[] = [
    { label: "المفكرة", icon: <NotebookPen size={15} />, onClick: () => router.push("/notepad") },
    { label: "العادات", icon: <ListChecks size={15} />, onClick: () => router.push("/habits") },
    { label: "الإعدادات", icon: <Settings2 size={15} />, onClick: () => router.push("/settings") },
    { label: "نسخ من أمس", icon: <CopyPlus size={15} />, onClick: () => setShowCopy(true) },
    { label: muted ? "تشغيل الصوت" : "كتم الصوت", icon: muted ? <VolumeX size={15} /> : <Volume2 size={15} />, onClick: toggleMute },
    { label: "رفع نغمة الخلفية", icon: <Music size={15} />, onClick: () => fileRef.current?.click() },
    { label: "المظهر", icon: <SunMoon size={15} />, onClick: () => toggleDark() },
    { label: "تسجيل الخروج", icon: <LogOut size={15} />, danger: true, onClick: logout },
  ];

  const iconBtn = "tap-target grid place-items-center size-9 rounded-full bg-surface-2 text-ink border border-line hover:border-accent transition";

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="hour-glow min-h-screen lg:h-screen lg:overflow-hidden flex flex-col">
        <header className="shrink-0 sticky top-0 z-30 backdrop-blur bg-bg/80 border-b border-line">
          <div className={`${initialHabits ? "max-w-7xl" : "max-w-6xl"} mx-auto px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-1.5 sm:gap-2`}>
            {/* logo is decorative — hidden on phones so the header stays one row (N8) */}
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <CloudSun size={26} className="text-accent" aria-hidden />
              <div className="leading-tight">
                <h1 className="font-heading text-xl text-ink">يومي</h1>
              </div>
            </div>

            <DayNav day={day} today={today} />

            {/* desktop cluster */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => setShowCopy(true)}
                className="flex items-center gap-1.5 rounded-full bg-accent/15 border border-accent/40 text-ink px-3 py-2 text-sm hover:bg-accent/25 transition whitespace-nowrap"
              >
                <CopyPlus size={16} aria-hidden /> نسخ من أمس
              </button>
              <Link href="/notepad" title="المفكرة" aria-label="المفكرة" className={iconBtn}>
                <NotebookPen size={18} aria-hidden />
              </Link>
              <Link href="/habits" title="العادات" aria-label="العادات" className={iconBtn}>
                <ListChecks size={18} aria-hidden />
              </Link>
              <SoundMenu />
              <ThemeToggle />
              <Menu
                items={[
                  { label: "الإعدادات", icon: <Settings2 size={15} />, onClick: () => router.push("/settings") },
                  { label: "تسجيل الخروج", icon: <LogOut size={15} />, danger: true, onClick: logout },
                ]}
                triggerLabel="حسابي"
                triggerClassName="flex items-center gap-1.5 rounded-full bg-surface-2 border border-line px-3 py-2 text-sm text-ink hover:border-accent transition"
              >
                <span className="text-ink-soft">أهلاً</span>
                <span className="font-medium max-w-[7rem] truncate">{name}</span>
                <ChevronDown size={14} aria-hidden />
              </Menu>
            </div>

            {/* mobile cluster: one row */}
            <div className="flex sm:hidden items-center gap-1.5">
              <Link href="/notepad" title="المفكرة" aria-label="المفكرة" className={iconBtn}>
                <NotebookPen size={18} aria-hidden />
              </Link>
              <Menu items={mobileMenu} triggerLabel="القائمة" triggerClassName={iconBtn}>
                <MoreVertical size={18} aria-hidden />
              </Menu>
            </div>
          </div>
        </header>

        <main
          className={`flex-1 lg:min-h-0 w-full mx-auto px-4 py-4 grid gap-4 ${
            initialHabits
              ? "max-w-7xl lg:grid-cols-[15rem_minmax(0,1fr)_15rem] xl:grid-cols-[17rem_minmax(0,1fr)_17rem]"
              : "max-w-6xl lg:grid-cols-[18rem_minmax(0,1fr)]"
          }`}
        >
          {/* ideas rail first in the DOM so, under RTL, it sits on the right */}
          <InboxColumn
            items={cols.inbox ?? []}
            onAdd={handleAddIdea}
            onDelete={handleDeleteIdea}
            onOpen={handleOpenIdeaNote}
            onMoveQuadrant={handleMoveIdeaToQuadrant}
          />

          <div className="order-first lg:order-none grid gap-3 sm:grid-cols-2 auto-rows-fr min-w-0 lg:h-full lg:min-h-0">
            {orderedMeta.map((m) => (
              <Column
                key={m.key}
                meta={m}
                items={cols[m.key] ?? []}
                onAdd={(t) => handleAddTask(m.key, t)}
                onToggle={handleToggle}
                onDelete={handleDeleteTask}
                onRename={handleRename}
                onOpenNote={handleOpenTaskNote}
                onMoveQuadrant={handleMoveTaskToQuadrant}
                onMoveToIdeas={handleMoveTaskToIdeas}
              />
            ))}
          </div>

          {/* habits rail last in the DOM so, under RTL, it sits on the left (counterpart of ideas) */}
          {initialHabits && <HabitsRail day={day} today={today} habits={initialHabits} />}
        </main>
      </div>

      <input ref={fileRef} type="file" accept="audio/*" hidden onChange={onThemeFile} />

      <DragOverlay>
        {activeItem ? (
          activeItem.kind === "task" ? <TaskCard item={activeItem} overlay /> : <IdeaCard item={activeItem} overlay />
        ) : null}
      </DragOverlay>

      {showCopy && <CopyYesterdayModal day={day} onClose={() => setShowCopy(false)} />}
    </DndContext>
  );
}
