"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Flame, Trophy, Target, Activity } from "lucide-react";
import { addDaysISO, numericDate } from "@/lib/date";
import {
  averageValue, buildHeatmap, eachDayISO, heatmapRange, rollingAverage, successRate, weekdayBreakdown,
  WEEK_ORDER, type HeatCell,
} from "@/lib/habits/analytics";
import { mistakeCorrelation, topMistakes } from "@/lib/habits/correlation";
import { evaluateDay, fmtNum } from "@/lib/habits/display";
import { goalSeries } from "@/lib/habits/goals";
import { computeStreaks } from "@/lib/habits/streaks";
import type { EntryDTO, HabitDTO, MistakeDTO } from "@/lib/habits/dto";
import type { Outcome } from "@/lib/habits/types";

// charts are lazy so recharts loads on this route only, after the summary paints
const ChartFallback = () => <div className="h-52 rounded-xl bg-surface-2/60 animate-pulse" />;
const ValueChart = dynamic(() => import("./HabitCharts").then((m) => m.ValueChart), { ssr: false, loading: ChartFallback });
const WeekdayChart = dynamic(() => import("./HabitCharts").then((m) => m.WeekdayChart), { ssr: false, loading: ChartFallback });
const CorrelationChart = dynamic(() => import("./HabitCharts").then((m) => m.CorrelationChart), { ssr: false, loading: ChartFallback });
const TopMistakesChart = dynamic(() => import("./HabitCharts").then((m) => m.TopMistakesChart), { ssr: false, loading: ChartFallback });

const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const toAr = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);
const daysWord = (n: number) => (n === 1 ? "يوم واحد" : n === 2 ? "يومان" : n <= 10 ? `${toAr(n)} أيام` : `${toAr(n)} يوماً`);
const VALUE_WINDOW = 90;

const HEAT_CLS: Record<HeatCell["level"], string> = {
  success: "bg-q-schedule-ink",
  partial: "bg-q-delegate-ink",
  failure: "bg-q-do-ink",
  skipped: "heat-skipped",
  unknown: "bg-surface-2 border border-line",
};
const HEAT_LABEL: Record<HeatCell["level"], string> = {
  success: "نجاح", partial: "قريب", failure: "لم يتحقق", skipped: "متخطّى", unknown: "غير مسجّل",
};

type Range = "30" | "90" | "all";

export default function HabitAnalytics({
  habit,
  today,
  entries,
  mistakes,
}: {
  habit: HabitDTO;
  today: string;
  entries: EntryDTO[];
  mistakes: MistakeDTO[];
}) {
  const [range, setRange] = useState<Range>("30");
  const measured = habit.progress_type === "measured";
  const mistakeText = useMemo(() => new Map(mistakes.map((m) => [m.id, m.text])), [mistakes]);

  const a = useMemo(() => {
    // only days the habit was live up to today count
    const inRange = entries.filter((e) => e.day >= habit.start_date && e.day <= today);
    const evaluated = inRange.map((e) => ({ e, ev: evaluateDay(habit, e, e.day) }));
    const outcomes: Record<string, Outcome> = {};
    const cells: Record<string, { outcome: Outcome; closeness: number | null }> = {};
    for (const { e, ev } of evaluated) {
      outcomes[e.day] = ev.outcome;
      cells[e.day] = ev;
    }

    const streaks = computeStreaks(outcomes, habit.start_date, today);
    const recorded = evaluated.filter(({ ev }) => ev.outcome === "success" || ev.outcome === "failure").length;
    const rate = successRate(evaluated.map(({ ev }) => ev.outcome));
    const valueOf = (e: EntryDTO) => (e.status === "done" ? e.value : null);
    const avg = measured ? averageValue(inRange.map(valueOf)) : null;

    const hm = heatmapRange(today);
    const heat = buildHeatmap(cells, hm.from, hm.to);

    let series: { label: string; value: number | null; rolling: number | null; goal: number | null }[] = [];
    if (measured) {
      const from = [habit.start_date, addDaysISO(today, -(VALUE_WINDOW - 1))].sort().pop()!;
      const days = from <= today ? eachDayISO(from, today) : [];
      const byDay = new Map(inRange.map((e) => [e.day, valueOf(e)]));
      const values = days.map((d) => byDay.get(d) ?? null);
      const roll = rollingAverage(values, 7);
      const goals = goalSeries(habit.goals, days);
      series = days.map((d, i) => ({ label: numericDate(d), value: values[i], rolling: roll[i], goal: goals[i] }));
    }

    const weekdays = weekdayBreakdown(evaluated.map(({ e, ev }) => ({ day: e.day, outcome: ev.outcome })))
      .map((w) => ({ label: WEEKDAYS_AR[w.weekday], rate: w.rate, recorded: w.recorded, order: WEEK_ORDER.indexOf(w.weekday) }))
      .sort((x, y) => x.order - y.order);

    const corr = mistakeCorrelation(
      evaluated.map(({ e, ev }) => ({ day: e.day, outcome: ev.outcome, value: valueOf(e), mistakeIds: e.mistakeIds })),
      habit.progress_type,
    );

    return { streaks, recorded, rate, avg, heat, series, weekdays, corr, inRange };
  }, [entries, habit, today, measured]);

  const top = useMemo(() => {
    const from = range === "all" ? null : addDaysISO(today, -(Number(range) - 1));
    return topMistakes(a.inRange, from).slice(0, 10).map((t) => ({ label: mistakeText.get(t.mistakeId) ?? "—", count: t.count }));
  }, [a.inRange, range, today, mistakeText]);

  const unit = habit.unit;
  const fmtMetric = (v: number | null) => (v == null ? "—" : measured ? `${fmtNum(v)}${unit ? ` ${unit}` : ""}` : pct(v));
  const card = "rounded-2xl border border-line bg-surface p-4";

  if (entries.length === 0) {
    return (
      <section className={`${card} text-center text-ink-soft text-sm py-10`}>
        لا تسجيلات بعد. سجّل هذه العادة من لوحة اليوم لتظهر هنا الإحصاءات.
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* summary */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat icon={<Flame size={16} aria-hidden />} label="السلسلة الحالية" value={daysWord(a.streaks.current)} />
        <Stat icon={<Trophy size={16} aria-hidden />} label="أفضل سلسلة" value={daysWord(a.streaks.best)} />
        <Stat icon={<Target size={16} aria-hidden />} label="نسبة النجاح" value={pct(a.rate)} hint={`من ${daysWord(a.recorded)} مسجّلة`} />
        {measured ? (
          <Stat icon={<Activity size={16} aria-hidden />} label="متوسط القيمة" value={a.avg == null ? "—" : fmtNum(a.avg)} hint={unit ?? undefined} />
        ) : (
          <Stat icon={<Activity size={16} aria-hidden />} label="أيام مسجّلة" value={toAr(a.recorded)} />
        )}
      </section>

      {/* mistake correlation — the most important chart */}
      <section className={card}>
        <h3 className="font-heading text-lg text-ink">أثر الأخطاء</h3>
        <p className="text-xs text-ink-soft mb-3">
          {measured ? "متوسط القيمة" : "نسبة النجاح"} في الأيام التي سُجّل فيها كل خطأ مقارنةً بباقي الأيام المسجّلة (للأخطاء المتكررة ٣ مرات فأكثر).
        </p>
        {a.corr.length === 0 ? (
          <p className="text-sm text-ink-soft/80 py-4 text-center">سيظهر هنا أثر كل خطأ بعد تسجيله في ٣ أيام على الأقل.</p>
        ) : (
          <>
            <CorrelationChart
              measured={measured}
              unit={unit}
              data={a.corr.map((r) => ({
                label: truncate(mistakeText.get(r.mistakeId) ?? "—", 28),
                with: r.withMetric, without: r.withoutMetric, withCount: r.withCount, withoutCount: r.withoutCount,
              }))}
            />
            <ul className="mt-3 flex flex-col divide-y divide-line text-sm">
              {a.corr.map((r) => {
                const diff = r.withMetric != null && r.withoutMetric != null ? r.withMetric - r.withoutMetric : null;
                return (
                  <li key={r.mistakeId} className="py-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <bdi className="text-ink min-w-0">{mistakeText.get(r.mistakeId)}</bdi>
                    <span className="text-xs text-ink-soft">
                      في أيامه <b className="text-q-do-ink">{fmtMetric(r.withMetric)}</b> ({daysWord(r.withCount)}) · في غيرها{" "}
                      <b className="text-q-schedule-ink">{fmtMetric(r.withoutMetric)}</b> ({daysWord(r.withoutCount)})
                      {diff != null && (
                        <> · الفرق <b className="text-ink">{measured ? fmtNum(diff) : `${Math.round(diff * 100)}`}{measured ? "" : " نقطة"}</b></>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* heatmap */}
      <section className={card}>
        <h3 className="font-heading text-lg text-ink mb-3">آخر ثلاثة أشهر</h3>
        <Heatmap weeks={a.heat} habit={habit} measured={measured} entries={a.inRange} />
      </section>

      {measured && a.series.length > 0 && (
        <section className={card}>
          <h3 className="font-heading text-lg text-ink">القيمة اليومية</h3>
          <p className="text-xs text-ink-soft mb-2">آخر {toAr(Math.min(VALUE_WINDOW, a.series.length))} يوماً، مع متوسط ٧ أيام وخط الهدف كما كان في كل يوم.</p>
          <ValueChart data={a.series} unit={unit} />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h3 className="font-heading text-lg text-ink mb-2">حسب أيام الأسبوع</h3>
          <WeekdayChart data={a.weekdays} />
        </section>

        <section className={card}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="font-heading text-lg text-ink">أكثر الأخطاء تكراراً</h3>
            <div className="flex gap-1" role="group" aria-label="المدة">
              {(["30", "90", "all"] as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  aria-pressed={range === r}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition ${range === r ? "bg-accent/20 border-accent/50 text-ink" : "border-line text-ink-soft hover:text-ink"}`}
                >
                  {r === "all" ? "الكل" : `${toAr(Number(r))} يوماً`}
                </button>
              ))}
            </div>
          </div>
          {top.length === 0 ? (
            <p className="text-sm text-ink-soft/80 py-6 text-center">لا أخطاء مسجّلة في هذه المدة.</p>
          ) : (
            <TopMistakesChart data={top.map((t) => ({ ...t, label: truncate(t.label, 28) }))} />
          )}
        </section>
      </div>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-xs text-ink-soft flex items-center gap-1.5"><span className="text-accent">{icon}</span>{label}</p>
      <p className="font-heading text-2xl text-ink mt-1">{value}</p>
      {hint && <p dir="auto" className="text-[11px] text-ink-soft">{hint}</p>}
    </div>
  );
}

function Heatmap({
  weeks, habit, measured, entries,
}: {
  weeks: (HeatCell | null)[][];
  habit: HabitDTO;
  measured: boolean;
  entries: EntryDTO[];
}) {
  const valueByDay = useMemo(() => new Map(entries.map((e) => [e.day, e.value])), [entries]);
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <div className="flex flex-col gap-[3px] text-[10px] text-ink-soft shrink-0 pt-px">
          {WEEK_ORDER.map((w) => <span key={w} className="h-3.5 leading-[0.875rem]">{WEEKDAYS_AR[w].replace("ال", "")}</span>)}
        </div>
        {/* under RTL the first (oldest) week sits on the right, like the other time charts */}
        <div className="flex gap-[3px]">
          {weeks.map((col, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {col.map((cell, j) => {
                if (!cell) return <span key={j} className="size-3.5" />;
                const before = cell.day < habit.start_date;
                const v = valueByDay.get(cell.day);
                const title = `${numericDate(cell.day)} — ${before ? "قبل البدء" : HEAT_LABEL[cell.level]}${measured && v != null ? ` (${fmtNum(v)})` : ""}`;
                const partialAlpha = cell.level === "partial" && cell.closeness != null ? 0.45 + cell.closeness * 0.55 : 1;
                return (
                  <span
                    key={j}
                    title={title}
                    aria-label={title}
                    className={`size-3.5 rounded-[3px] ${before ? "bg-transparent border border-dashed border-line" : HEAT_CLS[cell.level]}`}
                    style={cell.level === "partial" ? { opacity: partialAlpha } : undefined}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-soft">
        {(Object.keys(HEAT_LABEL) as HeatCell["level"][]).map((l) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <span className={`size-3 rounded-[3px] ${HEAT_CLS[l]}`} /> {HEAT_LABEL[l]}
          </span>
        ))}
      </div>
    </div>
  );
}
