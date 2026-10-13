"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPreviousDayTasks, copyFromYesterday } from "@/lib/actions";
import { META_BY_KEY } from "@/lib/quadrants";
import { numericDate, relativeLabel, todayISO } from "@/lib/date";
import type { TaskRow } from "@/lib/data";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";

const toArabicDigits = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
const tasksWord = (n: number) => (n === 1 ? "مهمة واحدة" : n === 2 ? "مهمتين" : `${toArabicDigits(n)} مهام`);

export default function CopyYesterdayModal({
  day,
  onClose,
}: {
  day: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<TaskRow[] | null>(null);
  const [prev, setPrev] = useState<string>("");
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [includeDone, setIncludeDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const today = todayISO();
  const targetLabel = day === today ? "إلى اليوم" : `إلى ${relativeLabel(day, today)} (${numericDate(day)})`;

  const keyOf = (r: { quadrant: string; title: string }) => `${r.quadrant}::${r.title.trim()}`;

  useEffect(() => {
    getPreviousDayTasks(day).then(({ prev, rows, existingKeys }) => {
      setPrev(prev);
      setRows(rows);
      const ex = new Set(existingKeys);
      setExisting(ex);
      // pre-select unfinished tasks that aren't already on the target day
      setSelected(new Set(rows.filter((r) => !r.done && !ex.has(keyOf(r))).map((r) => r.id)));
    });
  }, [day]);

  const visible = (rows ?? []).filter((r) => includeDone || !r.done);

  function toggle(id: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function confirm() {
    setBusy(true);
    const { copied } = await copyFromYesterday(day, [...selected]);
    router.refresh();
    onClose();
    toast.show(copied > 0 ? `تم نسخ ${tasksWord(copied)}` : "لا جديد لنسخه — كلها موجودة");
  }

  return (
    <Modal onClose={onClose} labelledBy="copy-title">
      <div className="p-4 border-b border-line">
        <h2 id="copy-title" className="font-heading text-xl text-ink">نسخ من أمس</h2>
        <p className="text-xs text-ink-soft mt-0.5">
          {prev ? `مهام يوم ${numericDate(prev)} — اختر ما تريد نسخه ${targetLabel}` : "…"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
        {rows === null && <p className="text-ink-soft text-sm text-center py-6">جارٍ التحميل…</p>}
        {rows !== null && visible.length === 0 && (
          <p className="text-ink-soft text-sm text-center py-6">لا توجد مهام لنسخها من أمس.</p>
        )}
        {visible.map((r) => {
          const m = META_BY_KEY[r.quadrant];
          const copied = existing.has(keyOf(r));
          return (
            <label
              key={r.id}
              className={`flex items-center gap-2.5 rounded-xl border border-line px-3 py-2.5 ${
                copied ? "opacity-60 cursor-default" : "cursor-pointer hover:bg-surface-2"
              }`}
            >
              <input
                type="checkbox"
                checked={!copied && selected.has(r.id)}
                disabled={copied}
                onChange={() => toggle(r.id)}
                className="size-5 accent-[var(--accent)] shrink-0"
              />
              <span className="size-2 rounded-full shrink-0" style={{ background: m.dot }} />
              <span dir="auto" className={`flex-1 min-w-0 text-sm ${r.done ? "line-through text-ink-soft" : "text-ink"}`}>{r.title}</span>
              {copied ? (
                <span className="text-[11px] text-ink-soft shrink-0">منسوخة</span>
              ) : (
                <span className="text-[11px] text-ink-soft shrink-0">{m.title}</span>
              )}
            </label>
          );
        })}
      </div>

      <div className="p-4 border-t border-line flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-ink-soft cursor-pointer">
          <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          انسخ المنجزة أيضاً
        </label>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-ink-soft hover:text-ink">إلغاء</button>
          <button
            onClick={confirm}
            disabled={busy || selected.size === 0}
            className="rounded-xl bg-accent text-white px-4 py-2 text-sm font-medium disabled:opacity-50 hover:brightness-105 transition"
          >
            {busy ? "…" : `نسخ ${toArabicDigits(selected.size)}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
