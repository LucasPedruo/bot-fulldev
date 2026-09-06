import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDatedEvent, normalizeTbaEvent } from "./agenda-tech-brasil.provider.js";

void test("normalizeDatedEvent maps a multi-day in-person event to a normalized event", () => {
  const event = normalizeDatedEvent(
    {
      nome: "Gophercon LATAM 2026",
      data: ["02", "03", "04"],
      url: "https://gopherconlatam.org/",
      cidade: "Florianópolis",
      uf: "SC",
      tipo: "presencial"
    },
    2026,
    8 // setembro
  );

  assert.equal(event.externalId, "2026-09-02-gophercon-latam-2026");
  assert.equal(event.source, "AgendaTechBrasil");
  assert.equal(event.title, "Gophercon LATAM 2026");
  assert.equal(event.location, "Florianópolis/SC");
  assert.equal(event.modality, "in_person");
  assert.equal(event.startDate?.getFullYear(), 2026);
  assert.equal(event.startDate?.getMonth(), 8);
  assert.equal(event.startDate?.getDate(), 2);
});

void test("normalizeDatedEvent maps a fully-online event with no location", () => {
  const event = normalizeDatedEvent(
    {
      nome: "Hacking Club - Workshop",
      data: ["23", "24"],
      url: "https://lp.hackingclub.com/",
      cidade: "",
      uf: "",
      tipo: "online"
    },
    2026,
    1
  );

  assert.equal(event.location, undefined);
  assert.equal(event.modality, "online");
});

void test("normalizeDatedEvent maps híbrido to hybrid", () => {
  const event = normalizeDatedEvent(
    {
      nome: "TDC Summit São Paulo",
      data: ["26", "27"],
      url: "https://thedevconf.com/tdc/2026/summit-sao-paulo/",
      cidade: "Pinheiros",
      uf: "SP",
      tipo: "híbrido"
    },
    2026,
    2
  );

  assert.equal(event.modality, "hybrid");
});

void test("normalizeTbaEvent has no start date and a tba-prefixed external id", () => {
  const event = normalizeTbaEvent({
    nome: "Select Experience",
    url: "https://codecon.dev/select",
    cidade: "São Paulo",
    uf: "SP",
    tipo: "presencial"
  });

  assert.equal(event.externalId, "tba-select-experience");
  assert.equal(event.startDate, undefined);
  assert.equal(event.location, "São Paulo/SP");
});
