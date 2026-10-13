import type { Outcome, ProgressType } from "./types";

export type CorrelationInput = {
  day: string;
  outcome: Outcome;
  value: number | null;
  mistakeIds: readonly number[];
};

export type MistakeCorrelation = {
  mistakeId: number;
  /** Recorded days on which this mistake was logged / not logged. */
  withCount: number;
  withoutCount: number;
  /** Measured: average value. Boolean: success rate 0..1. Null when no days. */
  withMetric: number | null;
  withoutMetric: number | null;
};

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * For each mistake logged on at least `minOccurrences` recorded days, compare
 * the habit's metric on days it was logged vs days it was not. Only recorded
 * days (success / failure) take part: skipped and unknown days say nothing.
 * Sorted by occurrences, then by id for a stable order.
 */
export function mistakeCorrelation(
  entries: readonly CorrelationInput[],
  progressType: ProgressType,
  minOccurrences = 3,
): MistakeCorrelation[] {
  const recorded = entries.filter((e) => e.outcome === "success" || e.outcome === "failure");
  const metricOf = (e: CorrelationInput): number | null =>
    progressType === "measured" ? e.value : e.outcome === "success" ? 1 : 0;

  const ids = new Set<number>();
  for (const e of recorded) for (const id of e.mistakeIds) ids.add(id);

  const out: MistakeCorrelation[] = [];
  for (const mistakeId of ids) {
    const withM: number[] = [];
    const withoutM: number[] = [];
    for (const e of recorded) {
      const m = metricOf(e);
      if (m == null) continue;
      (e.mistakeIds.includes(mistakeId) ? withM : withoutM).push(m);
    }
    if (withM.length < minOccurrences) continue;
    out.push({
      mistakeId,
      withCount: withM.length,
      withoutCount: withoutM.length,
      withMetric: avg(withM),
      withoutMetric: avg(withoutM),
    });
  }
  return out.sort((a, b) => b.withCount - a.withCount || a.mistakeId - b.mistakeId);
}

export type MistakeCount = { mistakeId: number; count: number };

/** Occurrences per mistake over entries with day >= from (from = null means all). */
export function topMistakes(
  entries: readonly { day: string; mistakeIds: readonly number[] }[],
  from: string | null,
): MistakeCount[] {
  const counts = new Map<number, number>();
  for (const e of entries) {
    if (from && e.day < from) continue;
    for (const id of new Set(e.mistakeIds)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts]
    .map(([mistakeId, count]) => ({ mistakeId, count }))
    .sort((a, b) => b.count - a.count || a.mistakeId - b.mistakeId);
}
