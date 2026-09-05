import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeHimalayasJob } from "./himalayas.provider.js";

void test("normalizeHimalayasJob maps a Portuguese-titled Himalayas payload to normalized job", () => {
  const job = normalizeHimalayasJob({
    title: "Desenvolvedor(a) BackEnd Node Junior",
    companyName: "FCamara ",
    seniority: ["Entry-level"],
    locationRestrictions: ["Brazil"],
    description: "<p>Vaga para atuar com Node.js e TypeScript.</p>",
    pubDate: 1788624940,
    applicationLink: "https://himalayas.app/companies/fcamara/jobs/dev-backend-node-junior?utm_source=test",
    guid: "https://himalayas.app/companies/fcamara/jobs/dev-backend-node-junior"
  });

  assert.equal(job.externalId, "https://himalayas.app/companies/fcamara/jobs/dev-backend-node-junior");
  assert.equal(job.source, "Himalayas");
  assert.equal(job.company, "FCamara");
  assert.equal(job.location, "Brasil");
  assert.equal(job.remote, true);
  assert.equal(job.level, "junior");
  assert.equal(job.category, "backend");
  assert.deepEqual(job.technologies, ["TypeScript", "Node.js"]);
  assert.equal(job.url, "https://himalayas.app/companies/fcamara/jobs/dev-backend-node-junior");
});

void test("normalizeHimalayasJob falls back to Himalayas seniority when the title has no level keyword", () => {
  const job = normalizeHimalayasJob({
    title: "Software Developer",
    companyName: "Acme",
    seniority: ["Mid-level"],
    locationRestrictions: [],
    description: "",
    pubDate: undefined,
    applicationLink: "https://himalayas.app/companies/acme/jobs/software-developer",
    guid: "https://himalayas.app/companies/acme/jobs/software-developer"
  });

  assert.equal(job.level, "mid");
  assert.equal(job.location, undefined);
  assert.equal(job.publishedAt, undefined);
});
