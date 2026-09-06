import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCafebugadoCard } from "./cafebugado.provider.js";

void test("normalizeCafebugadoCard maps an in-person card regardless of field order", () => {
  const event = normalizeCafebugadoCard({
    title: "Next Day #9",
    fields: ["08/09/2026", "10:00", "Terça", "Presencial", "São Paulo - SP"]
  });

  assert.ok(event);
  assert.equal(event?.externalId, "cafebugado-next-day-9-08-09-2026");
  assert.equal(event?.source, "CafeBugado");
  assert.equal(event?.title, "Next Day #9");
  assert.equal(event?.location, "São Paulo - SP");
  assert.equal(event?.modality, "in_person");
  assert.equal(event?.url, "https://eventos.cafebugado.com.br/eventos");
  assert.equal(event?.startDate?.getFullYear(), 2026);
  assert.equal(event?.startDate?.getMonth(), 8);
  assert.equal(event?.startDate?.getDate(), 8);
  assert.equal(event?.startDate?.getHours(), 10);
});

void test("normalizeCafebugadoCard tells fields apart by pattern, not position", () => {
  const event = normalizeCafebugadoCard({
    title: "Cloud Futures 2026",
    fields: ["Quarta", "09/09/2026", "Presencial", "08:30", "São Paulo - SP"]
  });

  assert.equal(event?.startDate?.getDate(), 9);
  assert.equal(event?.startDate?.getHours(), 8);
  assert.equal(event?.startDate?.getMinutes(), 30);
  assert.equal(event?.location, "São Paulo - SP");
});

void test("normalizeCafebugadoCard handles an online event with no location field", () => {
  const event = normalizeCafebugadoCard({
    title: "Live de Encerramento",
    fields: ["12/09/2026", "19:00", "Sábado", "Online"]
  });

  assert.equal(event?.location, undefined);
  assert.equal(event?.modality, "online");
});

void test("normalizeCafebugadoCard defaults to in_person when modality is missing", () => {
  const event = normalizeCafebugadoCard({
    title: "Evento Sem Modalidade",
    fields: ["01/10/2026"]
  });

  assert.equal(event?.modality, "in_person");
});

void test("normalizeCafebugadoCard returns undefined without a title or a parseable date", () => {
  assert.equal(normalizeCafebugadoCard({ title: "", fields: ["08/09/2026"] }), undefined);
  assert.equal(normalizeCafebugadoCard({ title: "Sem Data", fields: ["Presencial"] }), undefined);
});
