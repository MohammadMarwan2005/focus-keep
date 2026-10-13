import { test } from "node:test";
import assert from "node:assert/strict";
import { findMatchingMistake, mistakeKey, normalizeMistakeText, searchMistakes, sortSuggestions } from "./mistakes";

test("normalizeMistakeText trims, collapses whitespace and NFC-normalises", () => {
  assert.equal(normalizeMistakeText("  Caffeine   after\t6pm "), "Caffeine after 6pm");
  assert.equal(normalizeMistakeText("سهرت  مع\nالأصدقاء"), "سهرت مع الأصدقاء");
  // decomposed é (e + combining acute) becomes the composed form
  assert.equal(normalizeMistakeText("café"), "café");
});

test("mistakeKey folds Latin case; Arabic is unaffected", () => {
  assert.equal(mistakeKey("Caffeine After 6PM"), "caffeine after 6pm");
  assert.equal(mistakeKey("نسيت الهاتف"), "نسيت الهاتف");
});

test("findMatchingMistake reuses an existing row on exact (normalised) match only", () => {
  const rows = [
    { id: 1, text: "Watching reels after coming home" },
    { id: 2, text: "سهرت مع الأصدقاء" },
  ];
  assert.equal(findMatchingMistake(rows, "  watching reels after coming   home ")?.id, 1);
  assert.equal(findMatchingMistake(rows, "سهرت مع الأصدقاء")?.id, 2);
  assert.equal(findMatchingMistake(rows, "Watching reels"), undefined); // substring is not a match
  assert.equal(findMatchingMistake(rows, "   "), undefined);
});

test("sortSuggestions: suggest=true only, by usage then recency then id", () => {
  const rows = [
    { id: 1, text: "a", suggest: true, usage_count: 2, created_at: "2026-09-01T00:00:00Z" },
    { id: 2, text: "b", suggest: false, usage_count: 9, created_at: "2026-09-02T00:00:00Z" },
    { id: 3, text: "c", suggest: true, usage_count: 5, created_at: "2026-09-03T00:00:00Z" },
    { id: 4, text: "d", suggest: true, usage_count: 2, created_at: "2026-09-04T00:00:00Z" },
    { id: 5, text: "e", suggest: true, usage_count: 2, created_at: "2026-09-04T00:00:00Z" },
  ];
  assert.deepEqual(sortSuggestions(rows).map((r) => r.id), [3, 5, 4, 1]);
});

test("searchMistakes covers hidden rows, case-insensitive substring", () => {
  const rows = [
    { id: 1, text: "Caffeine after 6pm", suggest: true },
    { id: 2, text: "Watching reels after coming home", suggest: false },
    { id: 3, text: "نسيت الهاتف في الغرفة", suggest: true },
  ];
  assert.deepEqual(searchMistakes(rows, "AFTER").map((r) => r.id), [1, 2]);
  assert.deepEqual(searchMistakes(rows, "الهاتف").map((r) => r.id), [3]);
  assert.deepEqual(searchMistakes(rows, ""), []);
});
