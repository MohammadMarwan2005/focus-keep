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

/** Pure calendar arithmetic on YYYY-MM-DD (UTC internally, so no DST or runtime-zone effects). */
export function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
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

/* ----------------------- timezone-aware helpers ----------------------- */
// These work on YYYY-MM-DD strings plus an IANA zone and never read the
// runtime's local clock fields, so they behave the same on a UTC server, a
// Damascus laptop and in tests.

/** Used until the browser reports a zone at login (the server itself runs in UTC). */
export const DEFAULT_TIMEZONE = "Asia/Damascus";

/** True when `tz` is an IANA zone this runtime knows (e.g. "Asia/Damascus"). */
export function isValidTimezone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date (YYYY-MM-DD) of an instant as seen from `tz`. */
export function isoInTz(instant: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(instant);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/**
 * Today's date in the user's zone. Unlike todayISO() this does not depend on
 * the server clock's zone, so a UTC box no longer shows yesterday's board to a
 * Damascus user between midnight and 03:00. `now` is injectable for tests.
 */
export function todayISOInTz(tz: string, now: Date = new Date()): string {
  return isoInTz(now, tz);
}

/** Strict YYYY-MM-DD check that also rejects impossible dates like 2026-02-30. */
export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Whole days from `a` to `b` (b − a); negative when b is earlier. */
export function diffDaysISO(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Weekday index (Sunday = 0) of a YYYY-MM-DD string, independent of the runtime zone. */
export function weekdayIndexISO(iso: string): number {
  return new Date(iso + "T00:00:00Z").getUTCDay();
}
