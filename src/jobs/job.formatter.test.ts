import assert from "node:assert/strict";
import { test } from "node:test";
import { formatJobMessage } from "./job.formatter.js";
import type { NormalizedJob } from "./job.types.js";

void test("formatJobMessage omits absent optional fields", () => {
  const job: NormalizedJob = {
    externalId: "1",
    source: "Jobicy",
    title: "Backend Developer",
    company: "Acme",
    remote: true,
    category: "backend",
    technologies: [],
    url: "https://example.com/job",
    fingerprint: "abc",
    discoveredAt: new Date("2026-09-05T00:00:00.000Z")
  };

  const message = formatJobMessage(job);

  assert.match(message, /Nova vaga/);
  assert.match(message, /Backend Developer/);
  assert.match(message, /Acme/);
  assert.match(message, /Remoto/);
  assert.doesNotMatch(message, /undefined/);
});

void test("formatJobMessage includes trusted optional fields", () => {
  const job: NormalizedJob = {
    externalId: "1",
    source: "Jobicy",
    title: "Frontend Developer",
    company: "Acme",
    location: "Brazil",
    remote: true,
    level: "mid",
    category: "frontend",
    technologies: ["React", "TypeScript"],
    url: "https://example.com/job",
    fingerprint: "abc",
    discoveredAt: new Date("2026-09-05T00:00:00.000Z")
  };

  const message = formatJobMessage(job);

  assert.match(message, /Brazil/);
  assert.match(message, /React · TypeScript/);
  assert.match(message, /Pleno/);
});

void test("formatJobMessage omits Remoto for on-site or hybrid jobs", () => {
  const job: NormalizedJob = {
    externalId: "1",
    source: "Greenhouse",
    title: "Analista de Dados Pleno",
    company: "C6 Bank",
    location: "Híbrido, São Paulo",
    remote: false,
    level: "mid",
    category: "data",
    technologies: [],
    url: "https://example.com/job",
    fingerprint: "abc",
    discoveredAt: new Date("2026-09-05T00:00:00.000Z")
  };

  const message = formatJobMessage(job);

  assert.doesNotMatch(message, /Remoto/);
  assert.match(message, /Híbrido, São Paulo/);
});
