"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, SkipForward, X } from "lucide-react";
import { getCatchUp, saveEntriesBulk, saveEntry } from "@/lib/habit-actions";
import { numericDate, relativeLabel, todayISO } from "@/lib/date";
import { evaluateDay, OUTCOME_LABEL, OUTCOME_STYLE } from "@/lib/habits/display";
import type { CatchUpBlock, EntryDTO, HabitDTO } from "@/lib/habits/dto";
import type { EntryStatus } from "@/lib/habits/types";
import EntryPanel from "@/components/EntryPanel";
import HabitIcon from "@/components/HabitIcon";
import Modal from "@/components/Modal";
import { useSound } from "@/components/SoundManager";
import { useToast } from "@/components/Toast";

/** Set once per browser session (per tab), so route changes never re-open the sheet. */
const SHOWN_KEY = "yawmi_catchup_shown";
const DEFAULT_DAYS = 3;

const keyOf = (habitId: number, day: string) => `${habitId}:${day}`;

/**
 * "Did you do …?" for the last 14 days of reminder-enabled habits that have no
 * record. Opens once per session on the board; "لاحقًا" dismisses it for the
 * session. Older days are logged from the board itself.
 */
export default function CatchUpSheet({ onClose }: { onClose: (savedDays: Set<string>) => void }) {
  const toast = useToast();
  const { chime, tick } = useSound();
  const [data, setData] = useState<{ today: string; blocks: CatchUpBlock[] } | null>(null);
  const [entries, setEntries] = useState<Record<string, EntryDTO>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [more, setMore] = useState<Set<number>>(new Set());
  const [savedDays, setSavedDays] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SHOWN_KEY) === "1") return;
    } catch {
      /* storage blocked: still show once for this page view */
    }
    getCatchUp(todayISO()).then((res) => {
      // mark on arrival (not before the request) so a dev Strict Mode double-mount still shows it
      try { sessionStorage.setItem(SHOWN_KEY, "1"); } catch {}
      if (res.ok && res.data.blocks.length) setData(res.data);
      else if (!res.ok) console.warn("catch-up unavailable:", res.error);
    });
  }, []);

  const habitsById = useMemo(() => new Map((data?.blocks ?? []).map((b) => [b.habit.id, b.habit])), [data]);

  if (!data) return null;

  function close() {
    setData(null);
    onClose(savedDays);
  }

  function record(e: EntryDTO) {
    setEntries((p) => ({ ...p, [keyOf(e.habit_id, e.day)]: e }));
    setSavedDays((p) => new Set(p).add(e.day));
  }

  const selectedHabits = [...selected].map((k) => habitsById.get(Number(k.split(":")[0]))).filter(Boolean) as HabitDTO[];
  const allBoolean = selectedHabits.length > 0 && selectedHabits.every((h) => h.progress_type === "boolean");

  async function bulk(status: EntryStatus) {
    setBusy(true);
    const byHabit = new Map<number, string[]>();
    for (const k of selected) {
      const [hid, day] = k.split(":");
      byHabit.set(Number(hid), [...(byHabit.get(Number(hid)) ?? []), day]);
    }
    let failed = "";
    for (const [habitId, days] of byHabit) {
      const res = await saveEntriesBulk({ habitId, days, status, clientToday: todayISO() });
      if (res.ok) res.data.forEach(record);
      else failed = res.error;
    }
    setBusy(false);
    if (failed) toast.show(failed);
    else {
      setSelected(new Set());
      if (status === "done") chime();
      else tick();
    }
  }

  const pending = data.blocks.reduce(
    (n, b) => n + b.days.filter((d) => !entries[keyOf(b.habit.id, d)]).length,
    0,
  );

  return (
    <Modal onClose={close} labelledBy="catchup-title">
      <div className="p-4 border-b border-line">
        <h2 id="catchup-title" className="font-heading text-xl text-ink">ما فاتك تسجيله</h2>
        <p className="text-xs text-ink-soft mt-0.5">
          {pending > 0 ? "سجّل الأيام الماضية أو تخطَّها. يمكنك تحديد عدّة أيام لتسجيلها دفعة واحدة." : "اكتمل كل شيء 👏"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 no-scrollbar">
        {data.blocks.map(({ habit, days }) => {
          const shown = more.has(habit.id) ? days : days.slice(0, DEFAULT_DAYS);
          return (
            <section key={habit.id} className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm text-ink">
                <HabitIcon icon={habit} size={26} />
                <span>هل أنجزت <bdi className="font-medium">{habit.title}</bdi>؟</span>
              </h3>
              {shown.map((day) => {
                const k = keyOf(habit.id, day);
                return (
                  <CatchUpRow
                    key={k}
                    habit={habit}
                    day={day}
                    today={data.today}
                    entry={entries[k] ?? null}
                    selected={selected.has(k)}
                    onSelect={(on) =>
                      setSelected((p) => {
                        const n = new Set(p);
                        if (on) n.add(k);
                        else n.delete(k);
                        return n;
                      })
                    }
                    onEntry={record}
                  />
                );
              })}
              {days.length > DEFAULT_DAYS && !more.has(habit.id) && (
                <button
                  onClick={() => setMore((p) => new Set(p).add(habit.id))}
                  className="self-start inline-flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  <ChevronDown size={13} aria-hidden /> عرض المزيد ({days.length - DEFAULT_DAYS})
                </button>
              )}
            </section>
          );
        })}
      </div>

      <div className="p-3 border-t border-line flex flex-wrap items-center justify-between gap-2">
        {selected.size > 0 ? (
          <>
            <span className="text-xs text-ink-soft">محدّد: {selected.size}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {allBoolean && (
                <>
                  <button disabled={busy} onClick={() => void bulk("done")} className="rounded-lg bg-q-schedule-bg border border-q-schedule-ink/40 text-q-schedule-ink px-3 py-1.5 text-sm disabled:opacity-50">
                    أنجزت
                  </button>
                  <button disabled={busy} onClick={() => void bulk("missed")} className="rounded-lg bg-q-do-bg border border-q-do-ink/40 text-q-do-ink px-3 py-1.5 text-sm disabled:opacity-50">
                    لم أنجز
                  </button>
                </>
              )}
              <button disabled={busy} onClick={() => void bulk("skipped")} className="rounded-lg bg-surface-2 border border-line text-ink px-3 py-1.5 text-sm disabled:opacity-50">
                تخطَّ
              </button>
              <button onClick={() => setSelected(new Set())} className="rounded-lg px-2 py-1.5 text-sm text-ink-soft hover:text-ink">إلغاء التحديد</button>
            </div>
          </>
        ) : (
          <>
            <button onClick={close} className="rounded-xl px-4 py-2 text-sm text-ink-soft hover:text-ink">لاحقًا</button>
            <button onClick={close} className="rounded-xl bg-accent text-white px-4 py-2 text-sm font-medium hover:brightness-105 transition">تم</button>
          </>
        )}
      </div>
    </Modal>
  );
}

function CatchUpRow({
  habit,
  day,
  today,
  entry,
  selected,
  onSelect,
  onEntry,
}: {
  habit: HabitDTO;
  day: string;
  today: string;
  entry: EntryDTO | null;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onEntry: (e: EntryDTO) => void;
}) {
  const toast = useToast();
  const { chime, tick } = useSound();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const measured = habit.progress_type === "measured";
  const ev = evaluateDay(habit, entry, day);

  async function write(status: EntryStatus, value?: string) {
    if (busy) return;
    setBusy(true);
    const res = await saveEntry({ habitId: habit.id, day, status, value: value ?? null, clientToday: todayISO() });
    setBusy(false);
    if (!res.ok) {
      toast.show(res.error);
      return;
    }
    onEntry(res.data);
    const o = evaluateDay(habit, res.data, day).outcome;
    if (o === "success") chime();
    else tick();
    if (o === "failure") setExpanded(true);
  }

  const btn = "rounded-lg border px-2.5 py-1.5 text-xs transition disabled:opacity-50";

  return (
    <div className={`rounded-xl border px-2.5 py-2 ${entry ? OUTCOME_STYLE[ev.outcome] : "bg-surface border-line"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer min-w-[6.5rem]">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
            aria-label={`تحديد ${relativeLabel(day, today)}`}
          />
          <span className="text-sm text-ink">{relativeLabel(day, today)}</span>
          <span className="text-[11px] text-ink-soft tabular-nums">{numericDate(day)}</span>
        </label>

        <div className="flex-1 flex flex-wrap items-center justify-end gap-1.5">
          {entry && <span className="text-[11px] text-ink-soft me-1">{OUTCOME_LABEL[ev.outcome]}</span>}
          {measured ? (
            <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) void write("done", draft); }} className="flex items-center gap-1">
              <input
                value={draft}
                inputMode="decimal"
                dir="ltr"
                onChange={(e) => setDraft(e.target.value)}
                placeholder={entry?.value != null ? String(entry.value) : ""}
                aria-label={`قيمة ${habit.title} يوم ${numericDate(day)}`}
                className="w-16 rounded-md bg-surface border border-line px-1.5 py-1 text-base sm:text-xs text-ink outline-none focus:border-accent"
              />
              {habit.unit && <bdi className="text-[11px] text-ink-soft">{habit.unit}</bdi>}
              <button type="submit" disabled={busy || !draft.trim()} className={`${btn} bg-surface border-line text-ink hover:border-accent`}>
                حفظ
              </button>
            </form>
          ) : (
            <>
              <button disabled={busy} onClick={() => void write("done")} className={`${btn} ${entry?.status === "done" ? "bg-q-schedule-ink text-white border-q-schedule-ink" : "bg-surface border-line text-ink hover:border-q-schedule-ink"}`} aria-label="أنجزت">
                <Check size={14} aria-hidden />
              </button>
              <button disabled={busy} onClick={() => void write("missed")} className={`${btn} ${entry?.status === "missed" ? "bg-q-do-ink text-white border-q-do-ink" : "bg-surface border-line text-ink hover:border-q-do-ink"}`} aria-label="لم أنجز">
                <X size={14} aria-hidden />
              </button>
            </>
          )}
          <button disabled={busy} onClick={() => void write("skipped")} className={`${btn} ${entry?.status === "skipped" ? "bg-surface-2 border-ink-soft text-ink" : "bg-surface border-line text-ink-soft hover:text-ink"}`} aria-label="تخطَّ" title="تخطَّ هذا اليوم">
            <SkipForward size={14} aria-hidden />
          </button>
          {entry && (
            <button onClick={() => setExpanded((o) => !o)} aria-expanded={expanded} aria-label="ملاحظات وأخطاء" className="grid place-items-center size-7 rounded-lg text-ink-soft hover:text-accent">
              <ChevronDown size={15} className={`transition ${expanded ? "rotate-180" : ""}`} aria-hidden />
            </button>
          )}
        </div>
      </div>
      {expanded && entry && <EntryPanel key={entry.id} entry={entry} onEntry={onEntry} />}
    </div>
  );
}
