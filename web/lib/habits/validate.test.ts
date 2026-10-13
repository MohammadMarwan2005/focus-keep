import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveToday, validateColor, validateDay, validateEmoji, validateGoal, validateMistakeText, validateNotes,
  validateTimezone, validateTitle, validateValue,
} from "./validate";

const bad = (r: { ok: boolean }) => assert.equal(r.ok, false);
const good = <T>(r: { ok: boolean; value?: T }, v: T) => { assert.equal(r.ok, true); assert.deepEqual(r.value, v); };

test("title: non-empty, trimmed, <= 120", () => {
  good(validateTitle("  النوم "), "النوم");
  bad(validateTitle(""));
  bad(validateTitle("   "));
  bad(validateTitle(undefined));
  good(validateTitle("x".repeat(120)), "x".repeat(120));
  bad(validateTitle("x".repeat(121)));
});

test("value: finite and >= 0, accepts Arabic digits, rounds to 2 dp", () => {
  good(validateValue(7.5), 7.5);
  good(validateValue("7٫5"), 7.5);
  good(validateValue("٨"), 8);
  good(validateValue(0), 0);
  good(validateValue(1.005), 1.01);
  bad(validateValue(-1));
  bad(validateValue(NaN));
  bad(validateValue(Infinity));
  bad(validateValue("abc"));
  bad(validateValue(""));
  bad(validateValue(null));
});

test("goal: > 0", () => {
  good(validateGoal("8"), 8);
  bad(validateGoal(0));
  bad(validateGoal(-2));
  bad(validateGoal("x"));
});

test("notes <= 2000 and mistake text <= 200", () => {
  good(validateNotes(null), null);
  good(validateNotes("   "), null);
  good(validateNotes("ok"), "ok");
  bad(validateNotes("x".repeat(2001)));
  good(validateMistakeText(" Caffeine after 6pm "), "Caffeine after 6pm");
  bad(validateMistakeText(""));
  bad(validateMistakeText("x".repeat(201)));
});

test("day: valid date not after today", () => {
  good(validateDay("2026-10-13", "2026-10-13"), "2026-10-13");
  good(validateDay("2025-12-31", "2026-01-01"), "2025-12-31");
  bad(validateDay("2026-10-14", "2026-10-13"));
  bad(validateDay("2026-02-30", "2026-10-13"));
  bad(validateDay("today", "2026-10-13"));
});

test("resolveToday: client date must be within a day of the server's date in the user's zone", () => {
  good(resolveToday(undefined, "2026-10-13"), "2026-10-13");
  good(resolveToday("", "2026-10-13"), "2026-10-13");
  good(resolveToday("2026-10-13", "2026-10-13"), "2026-10-13");
  good(resolveToday("2026-10-14", "2026-10-13"), "2026-10-14"); // midnight race, client ahead
  good(resolveToday("2026-10-12", "2026-10-13"), "2026-10-12"); // client behind
  good(resolveToday("2026-01-01", "2025-12-31"), "2026-01-01"); // year boundary
  bad(resolveToday("2026-10-15", "2026-10-13"));
  bad(resolveToday("2026-10-11", "2026-10-13"));
  bad(resolveToday("nope", "2026-10-13"));
});

test("timezone, color, emoji", () => {
  good(validateTimezone("Asia/Damascus"), "Asia/Damascus");
  good(validateTimezone("Europe/Berlin"), "Europe/Berlin");
  bad(validateTimezone("Nowhere/Land"));
  good(validateColor("#D19A35"), "#d19a35");
  good(validateColor(""), null);
  bad(validateColor("red"));
  bad(validateColor("#fff"));
  good(validateEmoji("😴"), "😴");
  good(validateEmoji("👨‍👩‍👧"), "👨‍👩‍👧"); // ZWJ sequence is one grapheme
  good(validateEmoji(""), null);
  bad(validateEmoji("ab"));
});
