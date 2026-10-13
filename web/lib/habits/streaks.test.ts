import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStreaks } from "./streaks";
import type { Outcome } from "./types";

const S: Outcome = "success";
const F: Outcome = "failure";
const K: Outcome = "skipped";

test("consecutive successes count; failure breaks", () => {
  const o = { "2026-10-10": S, "2026-10-11": S, "2026-10-12": F, "2026-10-13": S };
  assert.deepEqual(computeStreaks(o, "2026-10-10", "2026-10-13"), { current: 1, best: 2 });
});

test("skipped days are transparent: neither count nor break", () => {
  const o = { "2026-10-10": S, "2026-10-11": K, "2026-10-12": S, "2026-10-13": S };
  assert.deepEqual(computeStreaks(o, "2026-10-10", "2026-10-13"), { current: 3, best: 3 });
});

test("unknown days (no record) break a streak", () => {
  const o = { "2026-10-10": S, "2026-10-11": S, /* 12 missing */ "2026-10-13": S };
  assert.deepEqual(computeStreaks(o, "2026-10-10", "2026-10-13"), { current: 1, best: 2 });
});

test("skipped vs unknown side by side", () => {
  const skipped = { "2026-10-11": S, "2026-10-12": K, "2026-10-13": S };
  const unknown = { "2026-10-11": S, "2026-10-13": S };
  assert.deepEqual(computeStreaks(skipped, "2026-10-11", "2026-10-13"), { current: 2, best: 2 });
  assert.deepEqual(computeStreaks(unknown, "2026-10-11", "2026-10-13"), { current: 1, best: 1 });
});

test("an unlogged today does not break the current streak, but an unlogged yesterday does", () => {
  const a = { "2026-10-11": S, "2026-10-12": S }; // today 13th not yet logged
  assert.deepEqual(computeStreaks(a, "2026-10-11", "2026-10-13"), { current: 2, best: 2 });
  const b = { "2026-10-11": S }; // 12th unknown, 13th unknown
  assert.deepEqual(computeStreaks(b, "2026-10-11", "2026-10-13"), { current: 0, best: 1 });
  const c = { "2026-10-11": S, "2026-10-12": S, "2026-10-13": F }; // today failed
  assert.deepEqual(computeStreaks(c, "2026-10-11", "2026-10-13"), { current: 0, best: 2 });
  const d = { "2026-10-11": S, "2026-10-12": S, "2026-10-13": K }; // today skipped → transparent
  assert.deepEqual(computeStreaks(d, "2026-10-11", "2026-10-13"), { current: 2, best: 2 });
});

test("streaks run across month and year boundaries", () => {
  const o = { "2025-12-30": S, "2025-12-31": S, "2026-01-01": S, "2026-01-02": S };
  assert.deepEqual(computeStreaks(o, "2025-12-30", "2026-01-02"), { current: 4, best: 4 });
  const f = { "2026-02-27": S, "2026-02-28": S, "2026-03-01": F, "2026-03-02": S, "2026-03-03": S, "2026-03-04": S };
  assert.deepEqual(computeStreaks(f, "2026-02-27", "2026-03-04"), { current: 3, best: 3 });
});

test("days before start_date are ignored; empty range is zero", () => {
  const o = { "2026-10-01": S, "2026-10-02": S, "2026-10-03": S };
  assert.deepEqual(computeStreaks(o, "2026-10-03", "2026-10-03"), { current: 1, best: 1 });
  assert.deepEqual(computeStreaks(o, "2026-10-05", "2026-10-03"), { current: 0, best: 0 });
  assert.deepEqual(computeStreaks({}, "2026-10-01", "2026-10-03"), { current: 0, best: 0 });
});
