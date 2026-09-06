import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeLumaEvent } from "./luma.provider.js";

void test("normalizeLumaEvent maps an offline event and strips down to event-level fields only", () => {
  const event = normalizeLumaEvent({
    api_id: "evt-eSJ0bgD1KSeTAW3",
    name: "Cursor Meetup São Paulo",
    start_at: "2026-09-10T20:00:00.000Z",
    location_type: "offline",
    url: "a1ycauyu",
    geo_address_info: {
      city_state: "São Paulo, SP",
      country: "Brazil"
    }
  });

  assert.equal(event.externalId, "luma-evt-eSJ0bgD1KSeTAW3");
  assert.equal(event.source, "Luma");
  assert.equal(event.title, "Cursor Meetup São Paulo");
  assert.equal(event.location, "São Paulo, SP");
  assert.equal(event.modality, "in_person");
  assert.equal(event.url, "https://luma.com/a1ycauyu");
  assert.equal(event.startDate?.toISOString(), "2026-09-10T20:00:00.000Z");
  assert.deepEqual(Object.keys(event).sort(), [
    "discoveredAt",
    "externalId",
    "fingerprint",
    "location",
    "modality",
    "source",
    "startDate",
    "title",
    "url"
  ]);
});

void test("normalizeLumaEvent maps a virtual event to online modality", () => {
  const event = normalizeLumaEvent({
    api_id: "evt-virtual",
    name: "Devfest Online Brasil",
    start_at: "2026-10-01T18:00:00.000Z",
    location_type: "virtual",
    url: "devfest-online"
  });

  assert.equal(event.modality, "online");
  assert.equal(event.location, undefined);
});

void test("normalizeLumaEvent defaults to in_person when location_type is missing", () => {
  const event = normalizeLumaEvent({
    api_id: "evt-unknown",
    name: "Hackathon Sem Fronteiras",
    start_at: "2026-11-01T18:00:00.000Z",
    url: "hack-sem-fronteiras"
  });

  assert.equal(event.modality, "in_person");
});
