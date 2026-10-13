import { diffDaysISO, isValidISODate, isValidTimezone } from "@/lib/date";
import type { EntryStatus, GoalDirection, ProgressType } from "./types";

/**
 * Input validation shared by the server actions. Every failure carries an
 * Arabic, user-facing message; nothing fails silently.
 */

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Validation<T> => ({ ok: true, value });
const fail = <T = never>(error: string): Validation<T> => ({ ok: false, error });

export const LIMITS = {
  title: 120,
  description: 2000,
  notes: 2000,
  mistake: 200,
  unit: 32,
  emoji: 16,
} as const;

/** Round to the DECIMAL(10,2) column's precision; EPSILON keeps 1.005 from rounding down. */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const toArabicDigits = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function validateTitle(v: unknown): Validation<string> {
  const t = str(v).trim();
  if (!t) return fail("اكتب عنواناً للعادة");
  if (t.length > LIMITS.title) return fail(`العنوان طويل (الحد ${toArabicDigits(LIMITS.title)} حرفاً)`);
  return ok(t);
}

export function validateDescription(v: unknown): Validation<string | null> {
  if (v == null) return ok(null);
  const t = str(v);
  if (t.length > LIMITS.description) return fail(`الوصف طويل (الحد ${toArabicDigits(LIMITS.description)} حرف)`);
  return ok(t.trim() ? t : null);
}

export function validateNotes(v: unknown): Validation<string | null> {
  if (v == null) return ok(null);
  const t = str(v);
  if (t.length > LIMITS.notes) return fail(`الملاحظات طويلة (الحد ${toArabicDigits(LIMITS.notes)} حرف)`);
  return ok(t.trim() ? t : null);
}

export function validateMistakeText(v: unknown): Validation<string> {
  const t = str(v).trim();
  if (!t) return fail("اكتب نص الخطأ");
  if (t.length > LIMITS.mistake) return fail(`نص الخطأ طويل (الحد ${toArabicDigits(LIMITS.mistake)} حرف)`);
  return ok(t);
}

export function validateUnit(v: unknown): Validation<string | null> {
  const t = str(v).trim();
  if (!t) return ok(null);
  if (t.length > LIMITS.unit) return fail(`الوحدة طويلة (الحد ${toArabicDigits(LIMITS.unit)} حرفاً)`);
  return ok(t);
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim()) {
    // accept Arabic-Indic digits and the Arabic decimal separator
    const latin = v.trim()
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .replace(/[٫,]/g, ".");
    return Number(latin);
  }
  return null;
}

/** A measured entry's value: finite and >= 0. */
export function validateValue(v: unknown): Validation<number> {
  const n = toNumber(v);
  if (n == null || !Number.isFinite(n)) return fail("القيمة غير صالحة");
  if (n < 0) return fail("القيمة لا يمكن أن تكون سالبة");
  if (n > 99_999_999) return fail("القيمة كبيرة جداً");
  return ok(round2(n));
}

/** A goal: finite and > 0. */
export function validateGoal(v: unknown): Validation<number> {
  const n = toNumber(v);
  if (n == null || !Number.isFinite(n)) return fail("الهدف غير صالح");
  if (n <= 0) return fail("الهدف يجب أن يكون أكبر من صفر");
  if (n > 99_999_999) return fail("الهدف كبير جداً");
  return ok(round2(n));
}

export function validateGoalDirection(v: unknown): Validation<GoalDirection> {
  return v === "at_least" || v === "at_most" ? ok(v) : fail("اتجاه الهدف غير صالح");
}

export function validateProgressType(v: unknown): Validation<ProgressType> {
  return v === "boolean" || v === "measured" ? ok(v) : fail("نوع التقدّم غير صالح");
}

export function validateStatus(v: unknown): Validation<EntryStatus> {
  return v === "done" || v === "missed" || v === "skipped" ? ok(v) : fail("حالة التسجيل غير صالحة");
}

/** Any valid calendar date (start_date may be in the future). */
export function validateDate(v: unknown): Validation<string> {
  const s = str(v).trim();
  return isValidISODate(s) ? ok(s) : fail("التاريخ غير صالح");
}

/** A day to log: valid and not after today (in the user's timezone). */
export function validateDay(v: unknown, today: string): Validation<string> {
  const d = validateDate(v);
  if (!d.ok) return d;
  if (d.value > today) return fail("لا يمكن التسجيل في يومٍ لم يأتِ بعد");
  return d;
}

/**
 * The client sends its own local date; it must agree with the server's
 * computation in the stored timezone to within one day (clock skew, midnight
 * races). When the client sends nothing, the server's date is used.
 */
export function resolveToday(clientToday: unknown, serverToday: string): Validation<string> {
  if (clientToday == null || clientToday === "") return ok(serverToday);
  const c = str(clientToday).trim();
  if (!isValidISODate(c)) return fail("تاريخ الجهاز غير صالح");
  if (Math.abs(diffDaysISO(serverToday, c)) > 1) {
    return fail("تاريخ جهازك لا يطابق منطقتك الزمنية؛ تحقّق من إعدادات الوقت");
  }
  // the stored zone is authoritative for the upper bound: a device that is a
  // day ahead must not unlock "tomorrow" or date a goal version early
  return ok(c < serverToday ? c : serverToday);
}

export function validateTimezone(v: unknown): Validation<string> {
  const tz = str(v).trim();
  return isValidTimezone(tz) ? ok(tz) : fail("المنطقة الزمنية غير معروفة");
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function validateColor(v: unknown): Validation<string | null> {
  const s = str(v).trim();
  if (!s) return ok(null);
  return HEX.test(s) ? ok(s.toLowerCase()) : fail("اللون غير صالح");
}

export function validateEmoji(v: unknown): Validation<string | null> {
  const s = str(v).trim();
  if (!s) return ok(null);
  if (s.length > LIMITS.emoji) return fail("الرمز طويل جداً");
  // a single grapheme (one emoji, possibly with modifiers / ZWJ sequences)
  const graphemes = typeof Intl !== "undefined" && "Segmenter" in Intl
    ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)].length
    : [...s].length;
  if (graphemes !== 1) return fail("اختر رمزاً واحداً");
  return ok(s);
}

export function validateId(v: unknown): Validation<number> {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? ok(n) : fail("معرّف غير صالح");
}
