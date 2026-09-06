import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDailySummary, pickSpotlightMessage } from "./scheduled-content.js";

void test("pickSpotlightMessage always substitutes the tag on regular weekdays", () => {
  for (const slot of ["morning", "lunch", "night"] as const) {
    for (let i = 0; i < 10; i += 1) {
      const message = pickSpotlightMessage(slot, "@5511999999999", 3);
      assert.match(message, /@5511999999999/);
      assert.doesNotMatch(message, /\{tag\}/);
    }
  }
});

void test("pickSpotlightMessage uses the Monday pool regardless of slot", () => {
  for (let i = 0; i < 10; i += 1) {
    const message = pickSpotlightMessage("morning", "@5511999999999", 1);
    assert.match(message, /segunda|semana/i);
  }
});

void test("pickSpotlightMessage uses the Friday pool regardless of slot", () => {
  for (let i = 0; i < 10; i += 1) {
    const message = pickSpotlightMessage("night", "@5511999999999", 5);
    assert.match(message, /semana/i);
  }
});

void test("buildDailySummary includes all four metrics", () => {
  const summary = buildDailySummary({ jobsToday: 3, messagesToday: 42, joinedToday: 2, leftToday: 1, weekday: 3 });

  assert.match(summary, /Vagas novas hoje: 3/);
  assert.match(summary, /Mensagens trocadas no grupo: 42/);
  assert.match(summary, /Pessoas que entraram: 2/);
  assert.match(summary, /Pessoas que saíram: 1/);
});

void test("buildDailySummary varies the intro on Monday and Friday", () => {
  const monday = buildDailySummary({ jobsToday: 0, messagesToday: 0, joinedToday: 0, leftToday: 0, weekday: 1 });
  const friday = buildDailySummary({ jobsToday: 0, messagesToday: 0, joinedToday: 0, leftToday: 0, weekday: 5 });
  const midweek = buildDailySummary({ jobsToday: 0, messagesToday: 0, joinedToday: 0, leftToday: 0, weekday: 3 });

  assert.match(monday, /Começando a semana/);
  assert.match(friday, /Fechando a semana/);
  assert.match(midweek, /Resumo do dia/);
});
