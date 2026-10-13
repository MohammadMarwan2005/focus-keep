import { test } from "node:test";
import assert from "node:assert/strict";
import { goalSeries, resolveGoal } from "./goals";
import type { GoalVersion } from "./types";

const v8: GoalVersion = { goal_value: 8, goal_direction: "at_least", effective_from: "2026-07-01" };
const v75: GoalVersion = { goal_value: 7.5, goal_direction: "at_least", effective_from: "2026-09-13" };

test("resolveGoal picks the latest version effective on or before the day", () => {
  const goals = [v75, v8]; // order must not matter
  assert.equal(resolveGoal(goals, "2026-06-30"), null);        // before any version
  assert.equal(resolveGoal(goals, "2026-07-01"), v8);          // first day of v8
  assert.equal(resolveGoal(goals, "2026-09-12"), v8);          // day before the change
  assert.equal(resolveGoal(goals, "2026-09-13"), v75);         // change takes effect on its day
  assert.equal(resolveGoal(goals, "2027-01-01"), v75);         // year boundary, still latest
  assert.equal(resolveGoal([], "2026-09-13"), null);
});

test("goalSeries steps where the version changes", () => {
  const days = ["2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14"];
  assert.deepEqual(goalSeries([v8, v75], days), [8, 8, 7.5, 7.5]);
  assert.deepEqual(goalSeries([v75], ["2026-09-12", "2026-09-13"]), [null, 7.5]);
});

test("history keeps its old meaning after a goal change", () => {
  // a 7.8h night under the old 8h goal is still a miss, even after the goal drops to 7.5
  const goals = [v8, v75];
  const old = resolveGoal(goals, "2026-09-01")!;
  const now = resolveGoal(goals, "2026-10-01")!;
  assert.equal(7.8 >= old.goal_value, false);
  assert.equal(7.8 >= now.goal_value, true);
});
