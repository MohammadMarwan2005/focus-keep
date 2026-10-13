"use client";

import { useRef, useState } from "react";
import { Lock, Loader2, Upload, X } from "lucide-react";
import { createHabit, updateHabit } from "@/lib/habit-actions";
import { todayISO } from "@/lib/date";
import { resolveGoal } from "@/lib/habits/goals";
import { MAX_SVG_BYTES } from "@/lib/habits/files";
import { contentOf, serializeLineDirs, type BidiContent } from "@/lib/habits/bidi";
import { LIMITS } from "@/lib/habits/validate";
import type { HabitDTO, HabitInput } from "@/lib/habits/dto";
import { resizeIcon } from "@/lib/image-resize";
import BidiField from "@/components/BidiField";
import HabitIcon from "@/components/HabitIcon";
import { useToast } from "@/components/Toast";

const QUICK_EMOJI = ["😴", "📖", "📱", "🕌", "🏋️", "🚶", "💧", "🥗", "🧘", "✍️", "🎯", "⭐"];

const field = "w-full rounded-lg bg-surface-2 border border-line px-3 py-2 text-base sm:text-sm text-ink outline-none focus:border-accent";
const label = "block text-xs text-ink-soft mb-1";

export default function HabitForm({
  initial,
  today,
  onSaved,
  onCancel,
}: {
  initial: HabitDTO | null;
  /** today in the user's zone (from the server) */
  today: string;
  onSaved: (h: HabitDTO) => void;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const currentGoal = initial ? resolveGoal(initial.goals, today) ?? initial.goals[0] ?? null : null;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [desc, setDesc] = useState<BidiContent>(() => contentOf(initial?.description, initial?.line_dirs));
  const [iconType, setIconType] = useState<HabitDTO["icon_type"]>(initial?.icon_type ?? "emoji");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "⭐");
  const [imagePath, setImagePath] = useState<string | null>(initial?.image_path ?? null);
  const [bg, setBg] = useState<string | null>(initial?.bg_color ?? "#f3ecdf");
  const [fg, setFg] = useState<string>(initial?.fg_color ?? "#3e322c");
  const [ptype, setPtype] = useState<HabitDTO["progress_type"]>(initial?.progress_type ?? "boolean");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [goalValue, setGoalValue] = useState(currentGoal ? String(currentGoal.goal_value) : "");
  const [goalDir, setGoalDir] = useState<"at_least" | "at_most">(currentGoal?.goal_direction ?? "at_least");
  const [reminder, setReminder] = useState(initial?.reminder_enabled ?? true);
  const [startDate, setStartDate] = useState(initial?.start_date ?? today);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const typeLocked = !!initial?.hasEntries;
  const iconPreview = { icon_type: iconType, emoji, image_path: imagePath, bg_color: bg, fg_color: fg };
  // an uploaded file only fits the type it was uploaded as
  const pathFits = (p: string | null, t: HabitDTO["icon_type"]) => !!p && (t === "svg") === p.endsWith(".svg");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr("");
    setUploading(true);
    try {
      const fd = new FormData();
      if (iconType === "svg") {
        if (file.size > MAX_SVG_BYTES) throw new Error("ملف SVG كبير جداً (الحد ١٠٠ كيلوبايت)");
        fd.append("file", file, "icon.svg");
        fd.append("kind", "svg");
      } else {
        let blob: Blob;
        try {
          blob = await resizeIcon(file);
        } catch {
          throw new Error("تعذّرت قراءة الصورة أو تصغيرها");
        }
        fd.append("file", blob, "icon");
        fd.append("kind", "image");
      }
      const res = await fetch("/api/habits/upload", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.path) throw new Error(j.error || "تعذّر رفع الأيقونة");
      setImagePath(j.path);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "تعذّر رفع الأيقونة");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setErr("اكتب عنواناً للعادة");
      return;
    }
    if (iconType !== "emoji" && !pathFits(imagePath, iconType)) {
      setErr("ارفع صورة للأيقونة أولاً");
      return;
    }
    setBusy(true);
    setErr("");
    const input: HabitInput = {
      title,
      description: desc.text,
      line_dirs: serializeLineDirs(desc.lineDirs),
      icon_type: iconType,
      emoji: iconType === "emoji" ? emoji : null,
      image_path: iconType === "emoji" ? null : imagePath,
      bg_color: bg,
      fg_color: iconType === "svg" ? fg : null,
      progress_type: ptype,
      unit: ptype === "measured" ? unit : null,
      goal_value: ptype === "measured" ? goalValue : null,
      goal_direction: goalDir,
      reminder_enabled: reminder,
      start_date: startDate,
    };
    const res = initial ? await updateHabit(initial.id, input, todayISO()) : await createHabit(input, todayISO());
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    toast.show(initial ? "تم حفظ العادة" : "تمت إضافة العادة");
    onSaved(res.data);
  }

  const seg = (on: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-sm border transition ${on ? "bg-accent/20 border-accent/50 text-ink" : "bg-surface border-line text-ink-soft hover:text-ink"}`;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <HabitIcon icon={iconPreview} size={52} />
        <div className="flex-1 min-w-0">
          <label className={label} htmlFor="hf-title">العنوان</label>
          <input
            id="hf-title"
            data-autofocus
            dir="auto"
            value={title}
            maxLength={LIMITS.title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثال: النوم / Reading"
            className={field}
          />
        </div>
      </div>

      <div>
        <span className={label}>الوصف (اختياري)</span>
        <BidiField
          value={desc}
          onChange={setDesc}
          placeholder="اكتب طريقتك في احتسابها، مثلاً: النوم يُحتسب لليلة التي تبدأ فيه"
          ariaLabel="الوصف"
          className={`${field} min-h-[4.5rem] leading-relaxed`}
        />
        <p className="text-[11px] text-ink-soft/80 mt-1">Ctrl + Shift (يمين/يسار) لفرض اتجاه السطر · {desc.text.length}/{LIMITS.description}</p>
      </div>

      {/* icon */}
      <fieldset className="rounded-xl border border-line p-3 flex flex-col gap-3">
        <legend className="px-1 text-xs text-ink-soft">الأيقونة</legend>
        <div className="flex gap-2">
          <button type="button" className={seg(iconType === "emoji")} onClick={() => setIconType("emoji")}>رمز تعبيري</button>
          <button type="button" className={seg(iconType === "image")} onClick={() => setIconType("image")}>صورة</button>
          <button type="button" className={seg(iconType === "svg")} onClick={() => setIconType("svg")}>SVG</button>
        </div>

        {iconType === "emoji" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              aria-label="الرمز"
              className="w-16 text-center text-xl rounded-lg bg-surface-2 border border-line px-2 py-1 outline-none focus:border-accent"
            />
            {QUICK_EMOJI.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setEmoji(em)}
                className={`size-9 rounded-lg text-lg border transition ${emoji === em ? "border-accent bg-accent/15" : "border-line hover:border-accent"}`}
              >
                {em}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-lg bg-surface border border-line px-3 py-2 text-sm text-ink hover:border-accent transition disabled:opacity-60"
            >
              {uploading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Upload size={15} aria-hidden />}
              {pathFits(imagePath, iconType) ? "تغيير الملف" : "رفع ملف"}
            </button>
            <span className="text-[11px] text-ink-soft">
              {iconType === "svg" ? "SVG أحادي اللون حتى ١٠٠ كيلوبايت؛ يُلوَّن باللون أدناه" : "PNG أو JPG أو WebP؛ تُصغَّر إلى ٢٥٦ بكسل"}
            </span>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept={iconType === "svg" ? ".svg,image/svg+xml" : "image/png,image/jpeg,image/webp"}
              onChange={onFile}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="color" value={bg ?? "#f3ecdf"} onChange={(e) => setBg(e.target.value)} className="size-8 rounded cursor-pointer bg-transparent" />
            لون الخلفية
            {bg && (
              <button type="button" onClick={() => setBg(null)} className="text-ink-soft hover:text-ink" aria-label="بلا لون خلفية" title="بلا لون">
                <X size={14} aria-hidden />
              </button>
            )}
          </label>
          {iconType === "svg" && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="size-8 rounded cursor-pointer bg-transparent" />
              لون الأيقونة
            </label>
          )}
        </div>
      </fieldset>

      {/* type & goal */}
      <fieldset className="rounded-xl border border-line p-3 flex flex-col gap-3">
        <legend className="px-1 text-xs text-ink-soft flex items-center gap-1">
          نوع التقدّم {typeLocked && <Lock size={12} aria-hidden />}
        </legend>
        <div className="flex gap-2">
          <button type="button" disabled={typeLocked} className={seg(ptype === "boolean")} onClick={() => setPtype("boolean")}>
            نعم / لا
          </button>
          <button type="button" disabled={typeLocked} className={seg(ptype === "measured")} onClick={() => setPtype("measured")}>
            قيمة مقاسة
          </button>
        </div>
        {typeLocked && <p className="text-[11px] text-ink-soft">النوع مقفل بعد أول تسجيل.</p>}

        {ptype === "measured" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label className={label} htmlFor="hf-dir">الهدف</label>
              <select id="hf-dir" value={goalDir} onChange={(e) => setGoalDir(e.target.value as "at_least" | "at_most")} className={field}>
                <option value="at_least">على الأقل</option>
                <option value="at_most">على الأكثر</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="hf-goal">القيمة</label>
              <input
                id="hf-goal"
                inputMode="decimal"
                dir="ltr"
                value={goalValue}
                onChange={(e) => setGoalValue(e.target.value)}
                placeholder="8"
                className={field}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={label} htmlFor="hf-unit">الوحدة</label>
              <input
                id="hf-unit"
                dir="auto"
                value={unit}
                maxLength={LIMITS.unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="ساعات / minutes"
                className={field}
              />
            </div>
            {initial && initial.progress_type === "measured" && (
              <p className="col-span-full text-[11px] text-ink-soft">
                تغيير الهدف يسري من اليوم؛ الأيام السابقة تبقى مقيّمة بهدفها القديم.
              </p>
            )}
          </div>
        )}
      </fieldset>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="hf-start">تاريخ البدء</label>
          <input id="hf-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink self-end pb-2 cursor-pointer">
          <input type="checkbox" checked={reminder} onChange={(e) => setReminder(e.target.checked)} className="size-5 accent-[var(--accent)]" />
          ذكّرني بالأيام التي لم أسجّلها
        </label>
      </div>

      <div className="min-h-[1.1rem]">{err && <p role="alert" className="text-q-do-ink text-sm">{err}</p>}</div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-sm text-ink-soft hover:text-ink">إلغاء</button>
        )}
        <button
          type="submit"
          disabled={busy || uploading}
          className="rounded-xl bg-accent text-white px-5 py-2 text-sm font-medium disabled:opacity-50 hover:brightness-105 transition"
        >
          {busy ? "…" : initial ? "حفظ" : "إضافة"}
        </button>
      </div>
    </form>
  );
}
