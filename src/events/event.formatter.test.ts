import assert from "node:assert/strict";
import { test } from "node:test";
import { formatEventReminderMessage, formatNewEventMessage } from "./event.formatter.js";
import type { PersistedEvent } from "./event.types.js";

const baseEvent: PersistedEvent = {
  id: "1",
  externalId: "2026-09-02-gophercon-latam-2026",
  source: "AgendaTechBrasil",
  title: "Gophercon LATAM 2026",
  location: "Florianópolis/SC",
  modality: "in_person",
  url: "https://gopherconlatam.org/",
  fingerprint: "abc",
  startDate: new Date(2026, 8, 2),
  discoveredAt: new Date()
};

void test("formatNewEventMessage includes title, date, modality, location, url and source", () => {
  const message = formatNewEventMessage(baseEvent);

  assert.match(message, /Gophercon LATAM 2026/);
  assert.match(message, /02\/09\/2026/);
  assert.match(message, /Presencial/);
  assert.match(message, /Florianópolis\/SC/);
  assert.match(message, /https:\/\/gopherconlatam\.org\//);
  assert.match(message, /Fonte: AgendaTechBrasil/);
});

void test("formatNewEventMessage shows a placeholder date for TBA events", () => {
  const message = formatNewEventMessage({ ...baseEvent, startDate: undefined, location: undefined });

  assert.match(message, /Data a definir/);
});

void test("formatEventReminderMessage varies the intro per notification type", () => {
  assert.match(formatEventReminderMessage(baseEvent, "event_7_days"), /Faltam 7 dias para Gophercon/);
  assert.match(formatEventReminderMessage(baseEvent, "event_3_days"), /Faltam 3 dias para Gophercon/);
  assert.match(formatEventReminderMessage(baseEvent, "event_tomorrow"), /Amanhã é Gophercon/);
  assert.match(formatEventReminderMessage(baseEvent, "event_today"), /Hoje é Gophercon/);
});
