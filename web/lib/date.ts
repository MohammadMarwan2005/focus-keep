// Arabic weekday names (Sunday = 0)
const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** Local YYYY-MM-DD for a Date (avoids UTC off-by-one). */
export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDaysISO(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return toISO(d);
}

/** Numeric date "21/9" per the house style. */
export function numericDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function weekday(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return WEEKDAYS[d.getDay()];
}

/** Friendly relative label for the header: اليوم / أمس / غدًا, else weekday. */
export function relativeLabel(iso: string, today: string): string {
  if (iso === today) return "اليوم";
  if (iso === addDaysISO(today, -1)) return "أمس";
  if (iso === addDaysISO(today, 1)) return "غدًا";
  return weekday(iso);
}
