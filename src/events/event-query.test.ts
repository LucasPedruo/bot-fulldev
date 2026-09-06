import assert from "node:assert/strict";
import { test } from "node:test";
import { extractLocation, extractMonth, isEventQuestion, parseEventQuery } from "./event-query.js";

void test("isEventQuestion requires both the word evento and a question marker", () => {
  assert.equal(isEventQuestion("tem evento em setembro?"), true);
  assert.equal(isEventQuestion("quais eventos tem esse mes"), true);
  assert.equal(isEventQuestion("adorei o evento de ontem!"), false);
  assert.equal(isEventQuestion("alguem sabe que horas sao?"), false);
});

void test("extractMonth resolves a named month to this year when it hasn't passed yet", () => {
  const referenceDate = new Date(2026, 8, 6); // September 6th 2026
  const result = extractMonth("tem evento em outubro?", referenceDate);

  assert.deepEqual(result, { month: 9, year: 2026 });
});

void test("extractMonth rolls over to next year for a month already passed", () => {
  const referenceDate = new Date(2026, 8, 6); // September
  const result = extractMonth("tem evento em marco?", referenceDate);

  assert.deepEqual(result, { month: 2, year: 2027 });
});

void test("extractMonth returns undefined when no month name is present", () => {
  assert.equal(extractMonth("tem evento em recife?", new Date(2026, 8, 6)), undefined);
});

void test("extractLocation captures the phrase after a location preposition and trims filler words", () => {
  assert.equal(extractLocation("tem algum evento em Recife?"), "Recife");
  assert.equal(extractLocation("quais eventos tem no Rio de Janeiro esse mes?"), "Rio de Janeiro");
});

void test("extractLocation returns undefined when the captured phrase is just a month name", () => {
  assert.equal(extractLocation("tem evento em setembro?"), undefined);
});

void test("parseEventQuery returns undefined for a message that isn't an event question", () => {
  assert.equal(parseEventQuery("bom dia pessoal"), undefined);
});

void test("parseEventQuery resolves month and location together, ignoring the double preposition", () => {
  const referenceDate = new Date(2026, 8, 6);
  const result = parseEventQuery("sabe se tem evento em outubro no rio?", referenceDate);

  assert.deepEqual(result, { month: 9, year: 2026, location: "rio" });
});

void test("parseEventQuery returns an empty-criteria object for a generic question", () => {
  const result = parseEventQuery("tem evento?");

  assert.deepEqual(result, { month: undefined, year: undefined, location: undefined });
});
