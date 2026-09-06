import assert from "node:assert/strict";
import { test } from "node:test";
import { formatEventPromoDescription, formatEventQueryReply, formatEventReminderMessage, formatNewEventMessage } from "./event.formatter.js";
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

void test("formatEventQueryReply lists matching events with date, location and url, each on its own block", () => {
  const message = formatEventQueryReply([baseEvent], { month: 8 });

  assert.match(message, /Eventos em setembro:/);
  assert.match(message, /1\. Gophercon LATAM 2026/);
  assert.match(message, /02\/09\/2026 — Florianópolis\/SC/);
  assert.match(message, /https:\/\/gopherconlatam\.org\//);
});

void test("formatEventQueryReply separates multiple events with a blank line", () => {
  const secondEvent: PersistedEvent = { ...baseEvent, id: "2", title: "TDC Summit", url: "https://thedevconf.com/" };
  const message = formatEventQueryReply([baseEvent, secondEvent], {});

  assert.match(message, /1\. Gophercon LATAM 2026[\s\S]*\n\n2\. TDC Summit/);
});

void test("formatEventQueryReply combines month and location in the criteria description", () => {
  const message = formatEventQueryReply([baseEvent], { month: 8, location: "Florianópolis" });

  assert.match(message, /Eventos em setembro em Florianópolis:/);
});

void test("formatEventQueryReply falls back to a generic label with no criteria", () => {
  const message = formatEventQueryReply([baseEvent], {});

  assert.match(message, /Eventos próximos:/);
});

void test("formatEventQueryReply returns a not-found message when there are no matches", () => {
  assert.match(formatEventQueryReply([], { location: "Curitiba" }), /Não encontrei nenhum evento em Curitiba\./);
  assert.match(formatEventQueryReply([], { month: 8 }), /Não encontrei nenhum evento em setembro\./);
  assert.match(formatEventQueryReply([], { month: 8, location: "Curitiba" }), /Não encontrei nenhum evento em setembro em Curitiba\./);
  assert.match(formatEventQueryReply([], {}), /Não encontrei nenhum evento registrado até agora\./);
});

void test("formatEventPromoDescription includes location and source", () => {
  const description = formatEventPromoDescription(baseEvent);

  assert.match(description, /Florianópolis\/SC/);
  assert.match(description, /https:\/\/gopherconlatam\.org\//);
  assert.match(description, /Fonte: AgendaTechBrasil/);
});
