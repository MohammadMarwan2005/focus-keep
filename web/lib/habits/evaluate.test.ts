import { test } from "node:test";
import assert from "node:assert/strict";
import { closeness, evaluateEntry } from "./evaluate";
import type { GoalVersion } from "./types";

const atLeast8: GoalVersion = { goal_value: 8, goal_direction: "at_least", effective_from: "2026-01-01" };
const atMost2: GoalVersion = { goal_value: 2, goal_direction: "at_most", effective_from: "2026-01-01" };

const near = (a: number | null, b: number) => assert.ok(a != null && Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test("no entry is unknown, skipped is skipped — for both types", () => {
  assert.deepEqual(evaluateEntry("boolean", null, null), { outcome: "unknown", closeness: null });
  assert.deepEqual(evaluateEntry("measured", undefined, atLeast8), { outcome: "unknown", closeness: null });
  assert.deepEqual(evaluateEntry("boolean", { status: "skipped", value: null }, null), { outcome: "skipped", closeness: null });
  assert.deepEqual(evaluateEntry("measured", { status: "skipped", value: 3 }, atLeast8), { outcome: "skipped", closeness: null });
});

test("boolean: done = success, missed = failure", () => {
  assert.deepEqual(evaluateEntry("boolean", { status: "done", value: null }, null), { outcome: "success", closeness: 1 });
  assert.deepEqual(evaluateEntry("boolean", { status: "missed", value: null }, null), { outcome: "failure", closeness: 0 });
});

test("measured at_least: value vs goal, closeness = clamp(value/goal)", () => {
  assert.deepEqual(evaluateEntry("measured", { status: "done", value: 8 }, atLeast8), { outcome: "success", closeness: 1 });
  assert.deepEqual(evaluateEntry("measured", { status: "done", value: 9.5 }, atLeast8), { outcome: "success", closeness: 1 });
  const r = evaluateEntry("measured", { status: "done", value: 6 }, atLeast8);
  assert.equal(r.outcome, "failure");
  near(r.closeness, 0.75);
  assert.deepEqual(evaluateEntry("measured", { status: "done", value: 0 }, atLeast8), { outcome: "failure", closeness: 0 });
});

test("measured at_most: under the cap is success, over it closeness = goal/value", () => {
  assert.deepEqual(evaluateEntry("measured", { status: "done", value: 1.5 }, atMost2), { outcome: "success", closeness: 1 });
  assert.deepEqual(evaluateEntry("measured", { status: "done", value: 2 }, atMost2), { outcome: "success", closeness: 1 });
  assert.deepEqual(evaluateEntry("measured", { status: "done", value: 0 }, atMost2), { outcome: "success", closeness: 1 });
  const r = evaluateEntry("measured", { status: "done", value: 3 }, atMost2);
  assert.equal(r.outcome, "failure");
  near(r.closeness, 2 / 3);
  near(closeness(8, atMost2), 0.25);
});

test("measured without a value: missed is a failure, done is unknown; no goal is unknown", () => {
  assert.deepEqual(evaluateEntry("measured", { status: "missed", value: null }, atLeast8), { outcome: "failure", closeness: 0 });
  assert.deepEqual(evaluateEntry("measured", { status: "done", value: null }, atLeast8), { outcome: "unknown", closeness: null });
  assert.deepEqual(evaluateEntry("measured", { status: "done", value: 5 }, null), { outcome: "unknown", closeness: null });
});

test("measured: the goal version passed in decides — same value, different verdicts", () => {
  const v75: GoalVersion = { ...atLeast8, goal_value: 7.5, effective_from: "2026-09-13" };
  assert.equal(evaluateEntry("measured", { status: "done", value: 7.8 }, atLeast8).outcome, "failure");
  assert.equal(evaluateEntry("measured", { status: "done", value: 7.8 }, v75).outcome, "success");
});
