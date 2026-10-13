import { test } from "node:test";
import assert from "node:assert/strict";
import {
  averageValue, buildHeatmap, eachDayISO, heatLevel, heatmapRange, rollingAverage, successRate,
  weekdayBreakdown,
} from "./analytics";

test("eachDayISO spans month and year boundaries inclusively", () => {
  assert.deepEqual(eachDayISO("2025-12-30", "2026-01-02"), ["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"]);
  assert.deepEqual(eachDayISO("2026-02-28", "2026-03-01"), ["2026-02-28", "2026-03-01"]);
  assert.deepEqual(eachDayISO("2026-03-02", "2026-03-01"), []);
});

test("successRate counts recorded days only; unknown and skipped are never failures", () => {
  assert.equal(successRate(["success", "failure", "success", "skipped", "unknown"]), 2 / 3);
  assert.equal(successRate(["skipped", "unknown"]), null);
  assert.equal(successRate([]), null);
});

test("averageValue and rollingAverage ignore nulls", () => {
  assert.equal(averageValue([8, null, 6]), 7);
  assert.equal(averageValue([null, undefined]), null);
  assert.deepEqual(rollingAverage([2, 4, null, 6], 2), [2, 3, 4, 6]);
  assert.deepEqual(rollingAverage([null, null], 7), [null, null]);
  // a 7-day window over 8 days: the last position drops the first value
  const r = rollingAverage([7, 1, 1, 1, 1, 1, 1, 1], 7);
  assert.ok(Math.abs(r[6]! - 13 / 7) < 1e-9);
  assert.equal(r[7], 1);
});

test("weekdayBreakdown groups by zone-independent weekday", () => {
  const stats = weekdayBreakdown([
    { day: "2026-10-11", outcome: "success" }, // Sunday
    { day: "2026-10-18", outcome: "failure" }, // Sunday
    { day: "2026-10-13", outcome: "success" }, // Tuesday
    { day: "2026-10-14", outcome: "skipped" }, // Wednesday — not recorded
  ]);
  assert.equal(stats.length, 7);
  assert.deepEqual(stats[0], { weekday: 0, rate: 0.5, recorded: 2 });
  assert.deepEqual(stats[2], { weekday: 2, rate: 1, recorded: 1 });
  assert.deepEqual(stats[3], { weekday: 3, rate: null, recorded: 0 });
});

test("heatLevel: partial is a near miss (closeness >= 0.75)", () => {
  assert.equal(heatLevel("success", 1), "success");
  assert.equal(heatLevel("failure", 0.9), "partial");
  assert.equal(heatLevel("failure", 0.75), "partial");
  assert.equal(heatLevel("failure", 0.74), "failure");
  assert.equal(heatLevel("failure", 0.5), "failure");
  assert.equal(heatLevel("failure", null), "failure");
  assert.equal(heatLevel("skipped", null), "skipped");
  assert.equal(heatLevel("unknown", null), "unknown");
});

test("heatmapRange: first of the month two months back, across a year boundary", () => {
  assert.deepEqual(heatmapRange("2026-10-13"), { from: "2026-08-01", to: "2026-10-13" });
  assert.deepEqual(heatmapRange("2026-01-15"), { from: "2025-11-01", to: "2026-01-15" });
  assert.deepEqual(heatmapRange("2026-02-01", 1), { from: "2026-02-01", to: "2026-02-01" });
});

test("buildHeatmap lays days into Saturday-first week columns with padding", () => {
  // 2026-10-01 is a Thursday → first column has Sat..Wed empty, Thu/Fri filled
  const weeks = buildHeatmap(
    { "2026-10-01": { outcome: "success", closeness: 1 }, "2026-10-03": { outcome: "failure", closeness: 0.8 } },
    "2026-10-01", "2026-10-04",
  );
  assert.equal(weeks.length, 2);
  assert.deepEqual(weeks[0].slice(0, 5), [null, null, null, null, null]);
  assert.equal(weeks[0][5]?.day, "2026-10-01");
  assert.equal(weeks[0][5]?.level, "success");
  assert.equal(weeks[0][6]?.day, "2026-10-02");
  assert.equal(weeks[0][6]?.level, "unknown");
  assert.equal(weeks[1][0]?.day, "2026-10-03");  // Saturday starts a new column
  assert.equal(weeks[1][0]?.level, "partial");
  assert.equal(weeks[1][1]?.day, "2026-10-04");
  assert.equal(weeks[1][2], null);
});
