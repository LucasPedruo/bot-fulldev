import assert from "node:assert/strict";
import { test } from "node:test";
import { isQuietHours } from "./quiet-hours.js";

function at(hours: number, minutes: number): Date {
  const date = new Date("2026-09-05T00:00:00");
  date.setHours(hours, minutes, 0, 0);
  return date;
}

void test("isQuietHours blocks midnight through just before the end time", () => {
  assert.equal(isQuietHours(at(0, 0)), true);
  assert.equal(isQuietHours(at(3, 30)), true);
  assert.equal(isQuietHours(at(6, 59)), true);
});

void test("isQuietHours allows the end time and everything after until the next midnight", () => {
  assert.equal(isQuietHours(at(7, 0)), false);
  assert.equal(isQuietHours(at(12, 0)), false);
  assert.equal(isQuietHours(at(23, 59)), false);
});

void test("isQuietHours handles a window that wraps past midnight", () => {
  assert.equal(isQuietHours(at(23, 0), "22:00", "08:00"), true);
  assert.equal(isQuietHours(at(3, 0), "22:00", "08:00"), true);
  assert.equal(isQuietHours(at(12, 0), "22:00", "08:00"), false);
});

void test("isQuietHours treats an equal start and end as disabled", () => {
  assert.equal(isQuietHours(at(3, 0), "05:00", "05:00"), false);
});
