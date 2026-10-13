import { test } from "node:test";
import assert from "node:assert/strict";
import { mistakeCorrelation, topMistakes, type CorrelationInput } from "./correlation";

const REELS = 1;
const CAFFEINE = 2;
const RARE = 3;

const sleep: CorrelationInput[] = [
  { day: "2026-10-01", outcome: "failure", value: 5.5, mistakeIds: [REELS] },
  { day: "2026-10-02", outcome: "success", value: 8.2, mistakeIds: [] },
  { day: "2026-10-03", outcome: "failure", value: 6.0, mistakeIds: [REELS, CAFFEINE] },
  { day: "2026-10-04", outcome: "success", value: 8.0, mistakeIds: [] },
  { day: "2026-10-05", outcome: "failure", value: 6.5, mistakeIds: [REELS] },
  { day: "2026-10-06", outcome: "skipped", value: null, mistakeIds: [REELS] },   // ignored
  { day: "2026-10-07", outcome: "unknown", value: null, mistakeIds: [] },        // ignored
  { day: "2026-10-08", outcome: "failure", value: 7.0, mistakeIds: [CAFFEINE] },
  { day: "2026-10-09", outcome: "success", value: 8.5, mistakeIds: [RARE] },
];

test("measured: average value with vs without, counts, >= 3 occurrences only", () => {
  const rows = mistakeCorrelation(sleep, "measured");
  assert.deepEqual(rows.map((r) => r.mistakeId), [REELS]); // CAFFEINE has 2, RARE has 1
  const reels = rows[0];
  assert.equal(reels.withCount, 3);
  assert.equal(reels.withoutCount, 4);
  assert.ok(Math.abs(reels.withMetric! - 6) < 1e-9);               // (5.5 + 6 + 6.5) / 3
  assert.ok(Math.abs(reels.withoutMetric! - 7.925) < 1e-9);        // (8.2 + 8 + 7 + 8.5) / 4
});

test("threshold is configurable; sorted by occurrences then id", () => {
  const rows = mistakeCorrelation(sleep, "measured", 2);
  assert.deepEqual(rows.map((r) => r.mistakeId), [REELS, CAFFEINE]);
  assert.equal(rows[1].withCount, 2);
});

test("boolean: success rate with vs without", () => {
  const prayer: CorrelationInput[] = [
    { day: "2026-10-01", outcome: "failure", value: null, mistakeIds: [REELS] },
    { day: "2026-10-02", outcome: "failure", value: null, mistakeIds: [REELS] },
    { day: "2026-10-03", outcome: "success", value: null, mistakeIds: [REELS] },
    { day: "2026-10-04", outcome: "success", value: null, mistakeIds: [] },
    { day: "2026-10-05", outcome: "success", value: null, mistakeIds: [] },
    { day: "2026-10-06", outcome: "failure", value: null, mistakeIds: [] },
    { day: "2026-10-07", outcome: "skipped", value: null, mistakeIds: [REELS] },
  ];
  const [r] = mistakeCorrelation(prayer, "boolean");
  assert.equal(r.mistakeId, REELS);
  assert.equal(r.withCount, 3);
  assert.equal(r.withoutCount, 3);
  assert.ok(Math.abs(r.withMetric! - 1 / 3) < 1e-9);
  assert.ok(Math.abs(r.withoutMetric! - 2 / 3) < 1e-9);
});

test("no recorded days → empty; measured days without a value are left out of averages", () => {
  assert.deepEqual(mistakeCorrelation([], "measured"), []);
  const rows = mistakeCorrelation([
    { day: "2026-10-01", outcome: "failure", value: null, mistakeIds: [REELS] },
    { day: "2026-10-02", outcome: "failure", value: 5, mistakeIds: [REELS] },
    { day: "2026-10-03", outcome: "failure", value: 6, mistakeIds: [REELS] },
  ], "measured");
  assert.deepEqual(rows, []); // only two days carry a value
});

test("topMistakes counts per range, newest cut by from", () => {
  const all = topMistakes(sleep, null);
  assert.deepEqual(all, [{ mistakeId: REELS, count: 4 }, { mistakeId: CAFFEINE, count: 2 }, { mistakeId: RARE, count: 1 }]);
  const recent = topMistakes(sleep, "2026-10-05");
  assert.deepEqual(recent, [{ mistakeId: REELS, count: 2 }, { mistakeId: CAFFEINE, count: 1 }, { mistakeId: RARE, count: 1 }]);
  // duplicate ids on one day count once
  assert.deepEqual(topMistakes([{ day: "2026-10-01", mistakeIds: [1, 1] }], null), [{ mistakeId: 1, count: 1 }]);
});
