"use client";

import { useRouter } from "next/navigation";
import { useDroppable } from "@dnd-kit/core";
import { CalendarDays } from "lucide-react";
import { addDaysISO, numericDate, relativeLabel, weekday } from "@/lib/date";

function NavButton({
  id, label, side, onClick,
}: { id: string; label: string; side: "prev" | "next"; onClick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={`shrink-0 rounded-full bg-surface border border-line text-ink px-3 sm:px-4 py-2 text-sm hover:border-accent transition ${
        isOver ? "ring-2 ring-accent scale-105 bg-accent/10" : ""
      }`}
      title={side === "prev" ? "اليوم السابق (أو أفلت مهمة هنا)" : "اليوم التالي (أو أفلت مهمة هنا)"}
    >
      {label}
    </button>
  );
}

export default function DayNav({ day, today }: { day: string; today: string }) {
  const router = useRouter();
  const go = (iso: string) => router.push(iso === today ? "/" : `/?day=${iso}`);

  return (
    <div className="flex items-center gap-1 sm:gap-3 min-w-0">
      <NavButton id="goto:prev" label="السابق" side="prev" onClick={() => go(addDaysISO(day, -1))} />

      <div className="text-center min-w-[3rem] sm:min-w-[7rem]">
        <div className="font-heading text-lg sm:text-2xl text-ink leading-none truncate">{relativeLabel(day, today)}</div>
        <label className="relative mt-1 inline-flex items-center gap-1 text-xs text-ink-soft cursor-pointer">
          <span>{day === today ? weekday(day) : ""}</span>
          <span className="tabular-nums">{numericDate(day)}</span>
          <CalendarDays size={13} aria-hidden />
          <input
            type="date"
            value={day}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label="اختر يوماً"
          />
        </label>
      </div>

      <NavButton id="goto:next" label="التالي" side="next" onClick={() => go(addDaysISO(day, 1))} />

      {day !== today && (
        <button
          onClick={() => go(today)}
          className="shrink-0 text-xs rounded-full bg-surface-2 border border-line px-2 sm:px-3 py-1.5 text-ink-soft hover:text-accent transition"
        >
          اليوم
        </button>
      )}
    </div>
  );
}
