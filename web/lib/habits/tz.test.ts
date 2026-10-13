import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDaysISO, diffDaysISO, isValidISODate, isValidTimezone, isoInTz, todayISOInTz, weekdayIndexISO,
} from "@/lib/date";

test("todayISOInTz: Damascus (no DST, UTC+3) rolls over at 21:00 UTC", () => {
  const tz = "Asia/Damascus";
  assert.equal(todayISOInTz(tz, new Date("2026-10-13T20:59:59Z")), "2026-10-13");
  assert.equal(todayISOInTz(tz, new Date("2026-10-13T21:00:00Z")), "2026-10-14");
  // the production bug: a UTC server at 22:00 still says the 13th
  assert.equal(todayISOInTz("UTC", new Date("2026-10-13T22:00:00Z")), "2026-10-13");
  assert.equal(todayISOInTz(tz, new Date("2026-10-13T22:00:00Z")), "2026-10-14");
});

test("todayISOInTz: Damascus across a year boundary", () => {
  assert.equal(todayISOInTz("Asia/Damascus", new Date("2025-12-31T21:30:00Z")), "2026-01-01");
  assert.equal(todayISOInTz("Asia/Damascus", new Date("2025-12-31T20:30:00Z")), "2025-12-31");
});

test("todayISOInTz: Berlin DST — the same UTC time maps to different local dates before and after the switch", () => {
  const tz = "Europe/Berlin";
  // CEST (UTC+2) until 2026-10-25 01:00Z, then CET (UTC+1)
  assert.equal(todayISOInTz(tz, new Date("2026-10-24T22:30:00Z")), "2026-10-25"); // +2 → 00:30 next day
  assert.equal(todayISOInTz(tz, new Date("2026-10-25T22:30:00Z")), "2026-10-25"); // +1 → 23:30 same day
  // spring forward 2026-03-29 01:00Z
  assert.equal(todayISOInTz(tz, new Date("2026-03-28T23:30:00Z")), "2026-03-29"); // +1 → 00:30
  assert.equal(todayISOInTz(tz, new Date("2026-03-29T00:30:00Z")), "2026-03-29"); // still +1 → 01:30
  assert.equal(todayISOInTz(tz, new Date("2026-03-29T01:30:00Z")), "2026-03-29"); // +2 → 03:30
  assert.equal(todayISOInTz(tz, new Date("2026-03-29T21:30:00Z")), "2026-03-29"); // +2 → 23:30
  assert.equal(todayISOInTz(tz, new Date("2026-03-29T22:30:00Z")), "2026-03-30"); // +2 → 00:30 next day
});

test("isoInTz is deterministic for the injected instant", () => {
  const t = new Date("2026-02-28T23:30:00Z");
  assert.equal(isoInTz(t, "UTC"), "2026-02-28");
  assert.equal(isoInTz(t, "Asia/Damascus"), "2026-03-01");
  assert.equal(isoInTz(t, "America/Los_Angeles"), "2026-02-28");
});

test("isValidTimezone", () => {
  assert.equal(isValidTimezone("Asia/Damascus"), true);
  assert.equal(isValidTimezone("Europe/Berlin"), true);
  assert.equal(isValidTimezone("UTC"), true);
  assert.equal(isValidTimezone("Mars/Olympus"), false);
  assert.equal(isValidTimezone(""), false);
});

test("addDaysISO crosses month and year boundaries", () => {
  assert.equal(addDaysISO("2026-01-31", 1), "2026-02-01");
  assert.equal(addDaysISO("2026-03-01", -1), "2026-02-28");
  assert.equal(addDaysISO("2028-03-01", -1), "2028-02-29"); // leap year
  assert.equal(addDaysISO("2026-01-01", -1), "2025-12-31");
  assert.equal(addDaysISO("2025-12-31", 1), "2026-01-01");
  assert.equal(addDaysISO("2026-10-13", -14), "2026-09-29");
});

test("diffDaysISO", () => {
  assert.equal(diffDaysISO("2026-01-01", "2026-01-01"), 0);
  assert.equal(diffDaysISO("2025-12-31", "2026-01-01"), 1);
  assert.equal(diffDaysISO("2026-01-01", "2025-12-31"), -1);
  assert.equal(diffDaysISO("2026-02-28", "2026-03-01"), 1);
  assert.equal(diffDaysISO("2026-03-01", "2026-04-01"), 31); // DST month in many zones: still 31 whole days
});

test("isValidISODate rejects shapes and impossible dates", () => {
  assert.equal(isValidISODate("2026-10-13"), true);
  assert.equal(isValidISODate("2028-02-29"), true);
  assert.equal(isValidISODate("2026-02-29"), false);
  assert.equal(isValidISODate("2026-13-01"), false);
  assert.equal(isValidISODate("2026-1-1"), false);
  assert.equal(isValidISODate("13/10/2026"), false);
  assert.equal(isValidISODate(""), false);
});

test("weekdayIndexISO is zone independent", () => {
  assert.equal(weekdayIndexISO("2026-10-13"), 2); // Tuesday
  assert.equal(weekdayIndexISO("2026-01-01"), 4); // Thursday
  assert.equal(weekdayIndexISO("2026-03-29"), 0); // Sunday (Berlin DST day)
});
