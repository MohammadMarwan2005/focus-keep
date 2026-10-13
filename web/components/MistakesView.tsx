"use client";

import { useMemo, useRef, useState } from "react";
import { Eye, EyeOff, ListChecks, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { deleteMistake, setMistakeSuggest, updateMistakeText } from "@/lib/habit-actions";
import { contentOf, serializeLineDirs, type BidiContent } from "@/lib/habits/bidi";
import type { HabitDTO, MistakeDTO } from "@/lib/habits/dto";
import BidiField, { BidiText } from "@/components/BidiField";
import HabitIcon from "@/components/HabitIcon";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/components/Toast";

const toAr = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
const rowBtn = "tap-target grid place-items-center rounded-lg bg-surface-2 border border-line text-ink-soft px-2.5 py-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed";

/** The whole mistake catalog: filter by habit, edit text, toggle suggest, delete unused rows. */
export default function MistakesView({
  name,
  habits,
  initial,
  initialHabit,
}: {
  name: string;
  habits: HabitDTO[];
  initial: MistakeDTO[];
  initialHabit: number | null;
}) {
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<number | null>(initialHabit);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<BidiContent>({ text: "", lineDirs: {} });
  // Enter and the blur that follows both commit; only the first one saves
  const editingRef = useRef<number | null>(null);
  const habitById = useMemo(() => new Map(habits.map((h) => [h.id, h])), [habits]);

  const visible = rows
    .filter((m) => filter == null || m.habit_id === filter)
    .sort((a, b) => b.usage_count - a.usage_count || a.text.localeCompare(b.text));

  const patch = (id: number, p: Partial<MistakeDTO>) => setRows((r) => r.map((m) => (m.id === id ? { ...m, ...p } : m)));

  async function toggleSuggest(m: MistakeDTO) {
    patch(m.id, { suggest: !m.suggest });
    const res = await setMistakeSuggest({ mistakeId: m.id, suggest: !m.suggest });
    if (!res.ok) {
      patch(m.id, { suggest: m.suggest });
      toast.show(res.error);
    }
  }

  async function saveText(m: MistakeDTO, c: BidiContent) {
    if (editingRef.current !== m.id) return;
    editingRef.current = null;
    setEditing(null);
    const text = c.text.replace(/\s+/g, " ").trim();
    const lineDirs = serializeLineDirs(c.lineDirs);
    if (!text || (text === m.text && lineDirs === m.line_dirs)) return;
    const res = await updateMistakeText({ mistakeId: m.id, text, line_dirs: lineDirs });
    if (!res.ok) return toast.show(res.error);
    patch(m.id, { text, line_dirs: lineDirs });
    toast.show("تم الحفظ");
  }

  async function remove(m: MistakeDTO) {
    const res = await deleteMistake(m.id);
    if (!res.ok) return toast.show(res.error);
    setRows((r) => r.filter((x) => x.id !== m.id));
    toast.show("تم حذف الخطأ");
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <PageHeader
        icon={<TriangleAlert size={24} aria-hidden />}
        title="الأخطاء"
        subtitle={name}
        links={[{ href: "/habits", label: "العادات", icon: <ListChecks size={16} aria-hidden /> }]}
      />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="mv-filter" className="text-sm text-ink-soft">العادة:</label>
          <select
            id="mv-filter"
            value={filter ?? ""}
            onChange={(e) => setFilter(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          >
            <option value="">كل العادات</option>
            {habits.map((h) => <option key={h.id} value={h.id}>{h.title}{h.archived ? " (مؤرشفة)" : ""}</option>)}
          </select>
          <span className="text-xs text-ink-soft">{toAr(visible.length)} خطأ</span>
        </div>

        {visible.length === 0 ? (
          <div className="grid place-items-center text-center text-ink-soft py-16">
            <TriangleAlert size={40} className="text-ink-soft/40 mb-3" aria-hidden />
            <p className="text-sm">لا أخطاء هنا بعد.</p>
            <p className="text-xs text-ink-soft/70 mt-1">أضف الأخطاء من تسجيلات العادات في لوحة اليوم.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((m) => {
              const h = habitById.get(m.habit_id);
              const c = contentOf(m.text, m.line_dirs);
              return (
                <li key={m.id} className={`rounded-xl border border-line bg-surface p-3 flex items-center gap-3 ${m.suggest ? "" : "opacity-70"}`}>
                  {filter == null && h && <HabitIcon icon={h} size={28} />}
                  <div className="min-w-0 flex-1">
                    {editing === m.id ? (
                      <BidiField
                        value={draft}
                        resetKey={`edit-${m.id}`}
                        autoFocus
                        singleLine
                        onChange={setDraft}
                        onEnter={(v) => void saveText(m, v)}
                        onCommit={(v) => void saveText(m, v)}
                        ariaLabel="نص الخطأ"
                        className="rounded-lg bg-surface-2 border border-accent px-2.5 py-1 text-sm text-ink"
                      />
                    ) : (
                      <BidiText {...c} className="text-sm text-ink" />
                    )}
                    <p className="text-[11px] text-ink-soft mt-0.5">
                      {filter == null && h ? <><bdi>{h.title}</bdi> · </> : null}
                      استُخدم {toAr(m.usage_count)} {m.usage_count === 1 ? "مرة" : "مرات"}
                      {!m.suggest && " · لا يُقترح"}
                    </p>
                  </div>
                  <button
                    onClick={() => { setDraft(c); editingRef.current = m.id; setEditing(m.id); }}
                    className={`${rowBtn} hover:text-accent hover:border-accent`}
                    title="تعديل النص"
                    aria-label="تعديل النص"
                  >
                    <Pencil size={15} aria-hidden />
                  </button>
                  <button
                    onClick={() => void toggleSuggest(m)}
                    aria-pressed={m.suggest}
                    className={`${rowBtn} hover:text-accent hover:border-accent`}
                    title={m.suggest ? "يُقترح — أوقف الاقتراح" : "لا يُقترح — أعد الاقتراح"}
                    aria-label={m.suggest ? "أوقف الاقتراح" : "أعد الاقتراح"}
                  >
                    {m.suggest ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}
                  </button>
                  <button
                    onClick={() => void remove(m)}
                    disabled={m.usage_count > 0}
                    className={`${rowBtn} enabled:hover:text-q-do-ink enabled:hover:border-q-do-ink`}
                    title={m.usage_count > 0 ? "مرتبط بتسجيلات؛ لا يمكن حذفه" : "حذف"}
                    aria-label="حذف"
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
