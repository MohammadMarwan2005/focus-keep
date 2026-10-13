"use client";

/*
 * recharts lives only in this module, which HabitAnalytics loads with
 * next/dynamic, so the day board bundle never includes it.
 * Time runs right-to-left (reversed X axis) to match the RTL UI.
 */

import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Colors = { ink: string; soft: string; line: string; good: string; bad: string; accent: string; accent2: string; surface: string };

function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
  return {
    ink: v("--ink", "#3e322c"),
    soft: v("--ink-soft", "#574a41"),
    line: v("--border", "rgba(0,0,0,.14)"),
    good: v("--q-schedule-ink", "#5f7d4f"),
    bad: v("--q-do-ink", "#b1546a"),
    accent: v("--accent", "#d19a35"),
    accent2: v("--accent-2", "#c48b97"),
    surface: v("--surface", "#ffffff"),
  };
}

/** Theme colors from the CSS tokens, refreshed when the dark class toggles. */
function useColors(): Colors | null {
  const [c, setC] = useState<Colors | null>(null);
  useEffect(() => {
    setC(readColors());
    const mo = new MutationObserver(() => setC(readColors()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return c;
}

const fmt = (n: unknown) => (typeof n === "number" ? String(Number(n.toFixed(2))) : "—");
const pct = (n: unknown) => (typeof n === "number" ? `${Math.round(n * 100)}%` : "—");

function tooltipStyle(c: Colors) {
  return {
    contentStyle: { background: c.surface, border: `1px solid ${c.line}`, borderRadius: 10, color: c.ink, fontSize: 12, direction: "rtl" as const },
    labelStyle: { color: c.soft },
  };
}

export type ValuePoint = { label: string; value: number | null; rolling: number | null; goal: number | null };

export function ValueChart({ data, unit }: { data: ValuePoint[]; unit: string | null }) {
  const c = useColors();
  if (!c) return <div className="h-64" />;
  return (
    <div dir="ltr" className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={c.line} vertical={false} />
          <XAxis dataKey="label" reversed tick={{ fill: c.soft, fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis orientation="right" tick={{ fill: c.soft, fontSize: 11 }} width={36} />
          <Tooltip {...tooltipStyle(c)} formatter={(v) => `${fmt(v)}${unit ? ` ${unit}` : ""}`} />
          <Legend wrapperStyle={{ fontSize: 12, color: c.soft }} />
          <Line name="القيمة" dataKey="value" stroke={c.accent2} strokeWidth={0} dot={{ r: 2.5, fill: c.accent2 }} isAnimationActive={false} connectNulls={false} />
          <Line name="متوسط ٧ أيام" dataKey="rolling" stroke={c.accent} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          <Line name="الهدف" dataKey="goal" type="stepAfter" stroke={c.good} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export type WeekdayPoint = { label: string; rate: number | null; recorded: number };

export function WeekdayChart({ data }: { data: WeekdayPoint[] }) {
  const c = useColors();
  if (!c) return <div className="h-52" />;
  return (
    <div dir="ltr" className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={c.line} vertical={false} />
          <XAxis dataKey="label" reversed tick={{ fill: c.soft, fontSize: 11 }} interval={0} />
          <YAxis orientation="right" domain={[0, 1]} tickFormatter={pct} tick={{ fill: c.soft, fontSize: 11 }} width={40} />
          <Tooltip {...tooltipStyle(c)} formatter={(v, _n, p) => [`${pct(v)} (${(p.payload as WeekdayPoint).recorded} يوم)`, "نسبة النجاح"]} />
          <Bar dataKey="rate" fill={c.good} radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type CorrelationPoint = { label: string; with: number | null; without: number | null; withCount: number; withoutCount: number };

export function CorrelationChart({ data, measured, unit }: { data: CorrelationPoint[]; measured: boolean; unit: string | null }) {
  const c = useColors();
  const h = Math.max(160, data.length * 56 + 40);
  if (!c) return <div style={{ height: h }} />;
  const f = measured ? (v: unknown) => `${fmt(v)}${unit ? ` ${unit}` : ""}` : pct;
  return (
    <div dir="ltr" style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 8 }} barGap={2}>
          <CartesianGrid stroke={c.line} horizontal={false} />
          <XAxis type="number" reversed tickFormatter={(v) => (measured ? fmt(v) : pct(v))} domain={measured ? [0, "auto"] : [0, 1]} tick={{ fill: c.soft, fontSize: 11 }} />
          <YAxis type="category" dataKey="label" orientation="right" width={150} tick={{ fill: c.ink, fontSize: 12 }} />
          <Tooltip
            {...tooltipStyle(c)}
            formatter={(v, name, p) => {
              const d = p.payload as CorrelationPoint;
              return [`${f(v)} (${name === "with" ? d.withCount : d.withoutCount} يوم)`, name === "with" ? "في أيامه" : "في غيرها"];
            }}
          />
          <Legend formatter={(v) => (v === "with" ? "في أيام الخطأ" : "في الأيام الأخرى")} wrapperStyle={{ fontSize: 12, color: c.soft }} />
          <Bar dataKey="with" fill={c.bad} radius={[6, 0, 0, 6]} isAnimationActive={false} />
          <Bar dataKey="without" fill={c.good} radius={[6, 0, 0, 6]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopMistakesChart({ data }: { data: { label: string; count: number }[] }) {
  const c = useColors();
  const h = Math.max(120, data.length * 34 + 30);
  if (!c) return <div style={{ height: h }} />;
  return (
    <div dir="ltr" style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <XAxis type="number" reversed allowDecimals={false} tick={{ fill: c.soft, fontSize: 11 }} />
          <YAxis type="category" dataKey="label" orientation="right" width={150} tick={{ fill: c.ink, fontSize: 12 }} />
          <Tooltip {...tooltipStyle(c)} formatter={(v) => [`${v} مرة`, "التكرار"]} />
          <Bar dataKey="count" fill={c.accent} radius={[6, 0, 0, 6]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
