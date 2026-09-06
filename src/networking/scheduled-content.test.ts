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

const baseSummaryInput = {
  jobsDiscovered: 0,
  jobsSent: 0,
  eventsDiscovered: 0,
  eventsSent: 0,
  eventRemindersSent: 0,
  messagesToday: 0,
  weekday: 3
};

void test("buildDailySummary includes every stat metric", () => {
  const summary = buildDailySummary({
    ...baseSummaryInput,
    jobsDiscovered: 3,
    jobsSent: 6,
    eventsDiscovered: 0,
    eventsSent: 0,
    eventRemindersSent: 1,
    messagesToday: 42
  });

  assert.match(summary, /Vagas descobertas hoje: 3/);
  assert.match(summary, /Vagas enviadas hoje: 6/);
  assert.match(summary, /Eventos descobertos hoje: 0/);
  assert.match(summary, /Eventos enviados hoje: 0/);
  assert.match(summary, /Lembretes de eventos enviados hoje: 1/);
  assert.match(summary, /Mensagens trocadas no grupo: 42/);
  assert.doesNotMatch(summary, /Pessoas que entraram/);
  assert.doesNotMatch(summary, /Pessoas que saíram/);
  assert.doesNotMatch(summary, /Mensagens com falha/);
  assert.doesNotMatch(summary, /Mensagens de networking enviadas/);
});

void test("buildDailySummary varies the intro on Monday and Friday", () => {
  const monday = buildDailySummary({ ...baseSummaryInput, weekday: 1 });
  const friday = buildDailySummary({ ...baseSummaryInput, weekday: 5 });
  const midweek = buildDailySummary({ ...baseSummaryInput, weekday: 3 });

  assert.match(monday, /Começando a semana/);
  assert.match(friday, /Fechando a semana/);
  assert.match(midweek, /Resumo do dia/);
});
