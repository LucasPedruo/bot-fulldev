import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeGreenhouseJob } from "./greenhouse.provider.js";

void test("normalizeGreenhouseJob maps a remote posting to normalized job", () => {
  const job = normalizeGreenhouseJob(
    {
      id: 42,
      title: "Pessoa Desenvolvedora React Pleno - Web",
      absolute_url: "https://job-boards.greenhouse.io/inter/jobs/42?utm_source=test",
      location: { name: "Remoto" },
      updated_at: "2026-09-03T10:23:36-04:00"
    },
    "Banco Inter"
  );

  assert.equal(job.externalId, "42");
  assert.equal(job.source, "Greenhouse");
  assert.equal(job.company, "Banco Inter");
  assert.equal(job.location, "Remoto");
  assert.equal(job.remote, true);
  assert.equal(job.level, "mid");
  assert.equal(job.category, "frontend");
  assert.deepEqual(job.technologies, ["React"]);
  assert.equal(job.url, "https://job-boards.greenhouse.io/inter/jobs/42");
});

void test("normalizeGreenhouseJob marks hybrid/on-site postings as not remote", () => {
  const job = normalizeGreenhouseJob(
    {
      id: 7,
      title: "Analista de Dados Pleno",
      absolute_url: "https://job-boards.greenhouse.io/c6bank/jobs/7",
      location: { name: "Híbrido, São Paulo" },
      updated_at: undefined
    },
    "C6 Bank"
  );

  assert.equal(job.remote, false);
  assert.equal(job.location, "Híbrido, São Paulo");
  assert.equal(job.level, "mid");
  assert.equal(job.category, "data");
  assert.equal(job.publishedAt, undefined);
});
