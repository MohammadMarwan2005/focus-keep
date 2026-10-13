import { test } from "node:test";
import assert from "node:assert/strict";
import { CATCH_UP_WINDOW, catchUpDays } from "./catchup";

test("window is exactly 14 days: yesterday .. today-14, never today or today-15", () => {
  const days = catchUpDays({ today: "2026-10-15", startDate: "2026-01-01", entryDays: [] });
  assert.equal(days.length, CATCH_UP_WINDOW);
  assert.equal(days[0], "2026-10-14");            // yesterday first (newest first)
  assert.equal(days[13], "2026-10-01");           // yesterday minus 13 = today minus 14 — included
  assert.ok(!days.includes("2026-10-15"));        // today never asked
  assert.ok(!days.includes("2026-09-30"));        // today minus 15 — outside the window
});

test("days with an entry are left out", () => {
  const days = catchUpDays({
    today: "2026-10-15", startDate: "2026-01-01",
    entryDays: new Set(["2026-10-14", "2026-10-12", "2026-10-01"]),
  });
  assert.equal(days.length, 11);
  assert.deepEqual(days.slice(0, 3), ["2026-10-13", "2026-10-11", "2026-10-10"]);
  assert.ok(!days.includes("2026-10-01"));
});

test("start_date inside the window cuts the list; start_date = yesterday asks only yesterday", () => {
  assert.deepEqual(
    catchUpDays({ today: "2026-10-15", startDate: "2026-10-12", entryDays: [] }),
    ["2026-10-14", "2026-10-13", "2026-10-12"],
  );
  assert.deepEqual(catchUpDays({ today: "2026-10-15", startDate: "2026-10-14", entryDays: [] }), ["2026-10-14"]);
  assert.deepEqual(catchUpDays({ today: "2026-10-15", startDate: "2026-10-15", entryDays: [] }), []);
  assert.deepEqual(catchUpDays({ today: "2026-10-15", startDate: "2026-11-01", entryDays: [] }), []);
});

test("month and year boundaries", () => {
  const jan = catchUpDays({ today: "2026-01-03", startDate: "2025-01-01", entryDays: [] });
  assert.deepEqual(jan.slice(0, 4), ["2026-01-02", "2026-01-01", "2025-12-31", "2025-12-30"]);
  assert.equal(jan[13], "2025-12-20");
  const mar = catchUpDays({ today: "2026-03-02", startDate: "2025-01-01", entryDays: [] });
  assert.deepEqual(mar.slice(0, 3), ["2026-03-01", "2026-02-28", "2026-02-27"]);
});

test("custom window", () => {
  const d = catchUpDays({ today: "2026-10-15", startDate: "2026-01-01", entryDays: [], windowDays: 3 });
  assert.deepEqual(d, ["2026-10-14", "2026-10-13", "2026-10-12"]);
});
