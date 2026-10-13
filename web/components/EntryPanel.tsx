"use client";

import { useState } from "react";
import { saveEntryNotes } from "@/lib/habit-actions";
import { contentOf, serializeLineDirs, type BidiContent } from "@/lib/habits/bidi";
import { LIMITS } from "@/lib/habits/validate";
import type { EntryDTO } from "@/lib/habits/dto";
import BidiField from "@/components/BidiField";
import MistakesPicker from "@/components/MistakesPicker";
import { useToast } from "@/components/Toast";

/** Notes + mistakes for one saved entry (used by the board rail and the catch-up sheet). */
export default function EntryPanel({
  entry,
  onEntry,
}: {
  entry: EntryDTO;
  onEntry: (e: EntryDTO) => void;
}) {
  const toast = useToast();
  const [notes, setNotes] = useState<BidiContent>(() => contentOf(entry.notes, entry.line_dirs));

  async function commit(c: BidiContent) {
    const lineDirs = serializeLineDirs(c.lineDirs);
    if (c.text === (entry.notes ?? "") && lineDirs === (entry.line_dirs ?? null)) return;
    if (c.text.length > LIMITS.notes) {
      toast.show("الملاحظات طويلة (الحد ٢٠٠٠ حرف)");
      return;
    }
    const res = await saveEntryNotes({ entryId: entry.id, notes: c.text, line_dirs: lineDirs });
    if (!res.ok) {
      toast.show(res.error);
      return;
    }
    onEntry({ ...entry, notes: c.text.trim() ? c.text : null, line_dirs: lineDirs });
  }

  return (
    <div className="flex flex-col gap-3 pt-2">
      <div>
        <BidiField
          value={notes}
          resetKey={entry.id}
          onChange={setNotes}
          onCommit={(c) => void commit(c)}
          placeholder="ملاحظات عن هذا اليوم…"
          ariaLabel="ملاحظات"
          className="min-h-[2.75rem] rounded-lg bg-surface border border-line px-2.5 py-1.5 text-sm text-ink leading-relaxed focus:border-accent"
        />
        {notes.text.length > LIMITS.notes * 0.8 && (
          <p className={`text-[11px] mt-0.5 ${notes.text.length > LIMITS.notes ? "text-q-do-ink" : "text-ink-soft"}`}>
            {notes.text.length}/{LIMITS.notes}
          </p>
        )}
      </div>
      <div>
        <p className="text-xs text-ink-soft mb-1.5">ما الذي أعاقك؟</p>
        <MistakesPicker
          habitId={entry.habit_id}
          entryId={entry.id}
          attachedIds={entry.mistakeIds}
          onAttachedChange={(ids) => onEntry({ ...entry, mistakeIds: ids })}
        />
      </div>
    </div>
  );
}
