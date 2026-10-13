"use client";

import { useEffect, useMemo, useState } from "react";
import { EyeOff, Loader2, Plus } from "lucide-react";
import { addEntryMistake, listHabitMistakes, setEntryMistake, setMistakeSuggest } from "@/lib/habit-actions";
import { findMatchingMistake, searchMistakes, sortSuggestions } from "@/lib/habits/mistakes";
import { parseLineDirs } from "@/lib/habits/bidi";
import { LIMITS } from "@/lib/habits/validate";
import type { MistakeDTO } from "@/lib/habits/dto";
import { useToast } from "@/components/Toast";

const MAX_CHIPS = 12;
const dirOf = (m: MistakeDTO) => parseLineDirs(m.line_dirs)["0"] ?? "auto";

/**
 * Attach / detach catalog mistakes on one entry. Chips are the suggest = true
 * rows (most used, then newest); typing searches the whole catalog including
 * hidden rows; Enter on new text reuses an exact match or creates a row.
 */
export default function MistakesPicker({
  habitId,
  entryId,
  attachedIds,
  onAttachedChange,
}: {
  habitId: number;
  entryId: number;
  attachedIds: number[];
  onAttachedChange: (ids: number[]) => void;
}) {
  const toast = useToast();
  const [catalog, setCatalog] = useState<MistakeDTO[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const attached = useMemo(() => new Set(attachedIds), [attachedIds]);

  useEffect(() => {
    let live = true;
    listHabitMistakes(habitId).then((res) => {
      if (!live) return;
      if (res.ok) setCatalog(res.data);
      else {
        setCatalog([]);
        toast.show(res.error);
      }
    });
    return () => { live = false; };
  }, [habitId, toast]);

  const chips = useMemo(() => {
    if (!catalog) return [];
    const top = sortSuggestions(catalog).slice(0, MAX_CHIPS);
    const shown = new Set(top.map((m) => m.id));
    // attached rows always show, even when hidden from suggestions
    const extra = catalog.filter((m) => attached.has(m.id) && !shown.has(m.id));
    return [...top, ...extra];
  }, [catalog, attached]);

  const results = useMemo(() => (catalog && query.trim() ? searchMistakes(catalog, query).slice(0, 8) : []), [catalog, query]);

  function bump(id: number, delta: number) {
    setCatalog((c) => c?.map((m) => (m.id === id ? { ...m, usage_count: Math.max(0, m.usage_count + delta) } : m)) ?? c);
  }

  async function toggle(m: MistakeDTO) {
    const on = !attached.has(m.id);
    const prev = attachedIds;
    onAttachedChange(on ? [...attachedIds, m.id] : attachedIds.filter((x) => x !== m.id));
    bump(m.id, on ? 1 : -1);
    const res = await setEntryMistake({ entryId, mistakeId: m.id, attached: on });
    if (!res.ok) {
      onAttachedChange(prev);
      bump(m.id, on ? -1 : 1);
      toast.show(res.error);
    }
  }

  async function hide(m: MistakeDTO) {
    setCatalog((c) => c?.map((x) => (x.id === m.id ? { ...x, suggest: false } : x)) ?? c);
    const res = await setMistakeSuggest({ mistakeId: m.id, suggest: false });
    if (!res.ok) {
      setCatalog((c) => c?.map((x) => (x.id === m.id ? { ...x, suggest: true } : x)) ?? c);
      toast.show(res.error);
      return;
    }
    toast.show("لن يُقترح بعد الآن", {
      action: {
        label: "تراجع",
        onClick: async () => {
          const r = await setMistakeSuggest({ mistakeId: m.id, suggest: true });
          if (r.ok) setCatalog((c) => c?.map((x) => (x.id === m.id ? { ...x, suggest: true } : x)) ?? c);
        },
      },
      duration: 5000,
    });
  }

  async function submit() {
    const text = query.trim();
    if (!text || busy) return;
    if (text.length > LIMITS.mistake) {
      toast.show("نص الخطأ طويل (الحد ٢٠٠ حرف)");
      return;
    }
    const existing = catalog ? findMatchingMistake(catalog, text) : undefined;
    if (existing) {
      if (!attached.has(existing.id)) await toggle(existing);
      setQuery("");
      return;
    }
    setBusy(true);
    const res = await addEntryMistake({ entryId, text });
    setBusy(false);
    if (!res.ok) {
      toast.show(res.error);
      return;
    }
    setCatalog((c) => [res.data, ...(c ?? []).filter((m) => m.id !== res.data.id)]);
    if (!attached.has(res.data.id)) onAttachedChange([...attachedIds, res.data.id]);
    setQuery("");
  }

  const chip = (on: boolean) =>
    `inline-flex items-center gap-1 rounded-full border ps-3 pe-1 py-1 text-xs transition ${
      on ? "bg-q-do-bg border-q-do-ink/50 text-q-do-ink" : "bg-surface border-line text-ink hover:border-accent"
    }`;

  return (
    <div className="flex flex-col gap-2">
      {catalog === null ? (
        <p className="text-xs text-ink-soft flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" aria-hidden /> جارٍ التحميل…</p>
      ) : chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((m) => {
            const on = attached.has(m.id);
            return (
              <span key={m.id} className={chip(on)}>
                <button type="button" onClick={() => void toggle(m)} aria-pressed={on} dir={dirOf(m)} className="min-h-6">
                  {m.text}
                </button>
                {m.suggest ? (
                  <button
                    type="button"
                    onClick={() => void hide(m)}
                    className="grid place-items-center size-6 rounded-full text-ink-soft/70 hover:text-ink hover:bg-surface-2"
                    title="لا تقترحه"
                    aria-label={`لا تقترح: ${m.text}`}
                  >
                    <EyeOff size={12} aria-hidden />
                  </button>
                ) : (
                  <span className="w-1.5" />
                )}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-ink-soft/80">لا أخطاء محفوظة لهذه العادة بعد.</p>
      )}

      <div className="relative">
        <div className="flex items-center gap-1">
          <input
            value={query}
            dir="auto"
            maxLength={LIMITS.mistake}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
              if (e.key === "Escape") setQuery("");
            }}
            placeholder="ابحث أو أضف خطأً…"
            aria-label="ابحث أو أضف خطأً"
            className="flex-1 min-w-0 rounded-lg bg-surface border border-line px-2.5 py-1.5 text-base sm:text-sm text-ink outline-none focus:border-accent placeholder:text-ink-soft/60"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!query.trim() || busy}
            className="shrink-0 tap-target grid place-items-center size-8 rounded-lg bg-surface border border-line text-ink-soft hover:text-accent hover:border-accent transition disabled:opacity-40"
            aria-label="إضافة الخطأ"
          >
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Plus size={15} aria-hidden />}
          </button>
        </div>
        {results.length > 0 && (
          <ul className="mt-1 rounded-lg border border-line bg-surface shadow-card max-h-48 overflow-y-auto">
            {results.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!attached.has(m.id)) void toggle(m);
                    setQuery("");
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-start hover:bg-surface-2"
                >
                  <span dir={dirOf(m)} className="min-w-0 truncate text-ink">{m.text}</span>
                  <span className="shrink-0 text-[11px] text-ink-soft">
                    {attached.has(m.id) ? "مضاف" : m.suggest ? "" : "مخفي"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
