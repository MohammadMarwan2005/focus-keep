"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check, ChevronDown, Circle, ListChecks, MoreVertical, Plus, SkipForward, X, Eraser, ExternalLink,
} from "lucide-react";
import { clearEntry, saveEntry } from "@/lib/habit-actions";
import { todayISO } from "@/lib/date";
import { evaluateDay, fmtNum, OUTCOME_LABEL, OUTCOME_STYLE } from "@/lib/habits/display";
import { resolveGoal } from "@/lib/habits/goals";
import type { BoardHabit, EntryDTO } from "@/lib/habits/dto";
import type { EntryStatus } from "@/lib/habits/types";
import EntryPanel from "@/components/EntryPanel";
import HabitIcon from "@/components/HabitIcon";
import Menu, { type MenuItem } from "@/components/Menu";
import { useSound } from "@/components/SoundManager";
import { useToast } from "@/components/Toast";

const rowBtnCls = "tap-target grid place-items-center rounded-lg text-ink-soft hover:text-accent hover:bg-surface-2 transition";

/**
 * The habits rail: the left-hand counterpart of the ideas rail (under RTL).
 * Lists active habits for the board's day; this is the primary place to log.
 */
export default function HabitsRail({
  day,
  today,
  habits,
}: {
  day: string;
  today: string;
  habits: BoardHabit[];
}) {
  const [items, setItems] = useState(habits);
  useEffect(() => setItems(habits), [habits]);
  const future = day > today;

  const setEntry = (habitId: number, entry: EntryDTO | null) =>
    setItems((p) => p.map((h) => (h.id === habitId ? { ...h, entry } : h)));

  const doneCount = items.filter((h) => evaluateDay(h, h.entry, day).outcome === "success").length;

  return (
    <section className="flex flex-col min-w-0 lg:h-full rounded-2xl border border-line bg-surface-2 p-3">
      <header className="flex items-baseline justify-between gap-2 mb-2 px-1">
        <h2 className="font-heading text-lg text-ink flex items-center gap-2">
          <ListChecks size={18} className="text-q-schedule-ink" aria-hidden /> عادات
        </h2>
        <span className="text-xs text-ink-soft shrink-0">
          {items.length > 0 ? `${doneCount}/${items.length}` : ""}
          <Link href="/habits" className="ms-2 text-accent hover:underline underline-offset-2">إدارة</Link>
        </span>
      </header>

      {future && items.length > 0 && (
        <p className="text-[11px] text-ink-soft px-1 mb-2">لا يمكن التسجيل في يومٍ لم يأتِ بعد.</p>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2">
        {items.map((h) => (
          <HabitRailItem key={h.id} h={h} day={day} disabled={future} onEntry={(e) => setEntry(h.id, e)} />
        ))}
        {items.length === 0 && (
          <div className="flex-1 grid place-items-center text-center text-ink-soft/70 text-sm py-3 gap-2">
            <span>لا عادات لهذا اليوم</span>
            <Link href="/habits" className="inline-flex items-center gap-1 text-accent text-xs hover:underline">
              <Plus size={13} aria-hidden /> أضف عادة
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function HabitRailItem({
  h,
  day,
  disabled,
  onEntry,
}: {
  h: BoardHabit;
  day: string;
  disabled: boolean;
  onEntry: (e: EntryDTO | null) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { chime, tick } = useSound();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // true while the inline input is open; Enter and blur both commit, Escape cancels, at most once
  const editingRef = useRef(false);

  const ev = evaluateDay(h, h.entry, day);
  const goal = resolveGoal(h.goals, day);
  const measured = h.progress_type === "measured";

  async function write(status: EntryStatus, value?: number | string) {
    if (disabled || pending) return;
    const prev = h.entry;
    setPending(true);
    const res = await saveEntry({ habitId: h.id, day, status, value: value ?? null, clientToday: todayISO() });
    setPending(false);
    if (!res.ok) {
      onEntry(prev);
      toast.show(res.error);
      return;
    }
    onEntry(res.data);
    const next = evaluateDay(h, res.data, day).outcome;
    if (next === "success") chime();
    else tick();
    // a miss opens the mistakes section so it can be noted while it's fresh
    if (next === "failure") setExpanded(true);
  }

  async function clear() {
    if (pending) return;
    const prev = h.entry;
    onEntry(null);
    setExpanded(false);
    const res = await clearEntry({ habitId: h.id, day });
    if (!res.ok) {
      onEntry(prev);
      toast.show(res.error);
    } else tick();
  }

  function toggleBoolean() {
    if (h.entry?.status === "done") void clear();
    else void write("done");
  }

  function openValue() {
    if (disabled) return;
    setDraft(h.entry?.value != null ? fmtNum(h.entry.value) : "");
    editingRef.current = true;
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function commitValue() {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    if (!draft.trim()) return;
    await write("done", draft);
  }

  function cancelValue() {
    editingRef.current = false;
    setEditing(false);
  }

  const menu: MenuItem[] = [
    ...(!disabled && h.entry?.status !== "missed"
      ? [{ label: "لم أنجزها", icon: <X size={15} />, onClick: () => void write("missed") }]
      : []),
    ...(!disabled && h.entry?.status !== "skipped"
      ? [{ label: "تخطَّ هذا اليوم", icon: <SkipForward size={15} />, onClick: () => void write("skipped") }]
      : []),
    ...(h.entry ? [{ label: "مسح التسجيل", icon: <Eraser size={15} />, danger: true, onClick: () => void clear() }] : []),
    { label: "صفحة العادة", icon: <ExternalLink size={15} />, onClick: () => router.push(`/habits/${h.id}`) },
  ];

  const stateIcon =
    ev.outcome === "success" ? <Check size={16} aria-hidden />
      : ev.outcome === "failure" ? <X size={16} aria-hidden />
        : ev.outcome === "skipped" ? <SkipForward size={14} aria-hidden />
          : <Circle size={16} className="opacity-50" strokeDasharray="3 3" aria-hidden />;
  const stateTone =
    ev.outcome === "success" ? "bg-q-schedule-ink text-white border-q-schedule-ink"
      : ev.outcome === "failure" ? "bg-q-do-ink text-white border-q-do-ink"
        : ev.outcome === "skipped" ? "bg-surface-2 text-ink-soft border-line border-dashed"
          : "bg-surface text-ink-soft border-line";

  return (
    <div className={`group rounded-xl border px-2 py-1.5 shadow-card transition ${OUTCOME_STYLE[ev.outcome]} ${pending ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-1.5">
        <HabitIcon icon={h} size={28} />

        <div className="min-w-0 flex-1">
          <p dir="auto" className="text-sm leading-snug text-ink truncate" title={h.title}>{h.title}</p>
          {measured && !editing && (
            <button
              type="button"
              onClick={openValue}
              disabled={disabled}
              className="text-[11px] text-ink-soft tabular-nums hover:text-accent disabled:hover:text-ink-soft"
              title="أدخل القيمة"
            >
              {/* numbers isolated LTR so "6 / ≥8" reads the same inside RTL text */}
              <bdi dir="ltr">
                {h.entry?.value != null ? fmtNum(h.entry.value) : "—"}
                {goal ? ` / ${goal.goal_direction === "at_most" ? "≤" : "≥"}${fmtNum(goal.goal_value)}` : ""}
              </bdi>
              {h.unit ? <bdi dir="auto"> {h.unit}</bdi> : null}
            </button>
          )}
          {measured && editing && (
            <form
              onSubmit={(e) => { e.preventDefault(); void commitValue(); }}
              className="flex items-center gap-1 mt-0.5"
            >
              <input
                ref={inputRef}
                value={draft}
                inputMode="decimal"
                dir="ltr"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void commitValue()}
                onKeyDown={(e) => e.key === "Escape" && cancelValue()}
                aria-label={`قيمة ${h.title}`}
                className="w-16 rounded-md bg-surface border border-line px-1.5 py-0.5 text-base sm:text-xs text-ink outline-none focus:border-accent"
              />
              {h.unit && <span dir="auto" className="text-[11px] text-ink-soft">{h.unit}</span>}
            </form>
          )}
          {measured && ev.closeness != null && ev.outcome === "failure" && (
            <div className="mt-1 h-1 rounded-full bg-line overflow-hidden" aria-hidden>
              <div className="h-full bg-q-do-ink/70" style={{ width: `${Math.round(ev.closeness * 100)}%` }} />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => (measured ? openValue() : toggleBoolean())}
          disabled={disabled || pending}
          aria-label={`${h.title}: ${OUTCOME_LABEL[ev.outcome]}`}
          title={measured ? "أدخل القيمة" : h.entry?.status === "done" ? "إلغاء الإنجاز" : "تم"}
          className={`shrink-0 tap-target grid place-items-center size-8 rounded-full border transition disabled:opacity-60 ${stateTone}`}
        >
          {stateIcon}
        </button>

        <button
          type="button"
          onClick={() => setExpanded((o) => !o)}
          aria-expanded={expanded}
          aria-label="ملاحظات وأخطاء"
          title="ملاحظات وأخطاء"
          className={`${rowBtnCls} size-7 ${h.entry?.notes || h.entry?.mistakeIds.length ? "text-accent" : ""}`}
        >
          <ChevronDown size={15} className={`transition ${expanded ? "rotate-180" : ""}`} aria-hidden />
        </button>

        <Menu
          items={menu}
          triggerLabel="خيارات العادة"
          triggerClassName={`tap-visible opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${rowBtnCls} size-7`}
        >
          <MoreVertical size={15} aria-hidden />
        </Menu>
      </div>

      {expanded && (
        h.entry ? (
          <EntryPanel key={h.entry.id} entry={h.entry} onEntry={(e) => onEntry(e)} />
        ) : (
          <p className="text-[11px] text-ink-soft pt-2">سجّل اليوم أولاً لإضافة ملاحظات وأخطاء.</p>
        )
      )}
    </div>
  );
}
