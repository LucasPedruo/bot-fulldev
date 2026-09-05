import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeArbeitnowJob } from "./arbeitnow.provider.js";

void test("normalizeArbeitnowJob maps Arbeitnow payload to normalized job", () => {
  const job = normalizeArbeitnowJob({
    slug: "senior-backend-developer-acme-123",
    company_name: "Acme ",
    title: "Senior Backend Developer",
    description: "&lt;p&gt;Build APIs with Node.js and TypeScript.&lt;/p&gt;",
    remote: true,
    url: "https://www.arbeitnow.com/jobs/companies/acme/senior-backend-developer-acme-123?utm_source=test",
    tags: ["node", "typescript", "aws", "backend"],
    job_types: ["Full-time"],
    location: "Germany",
    created_at: 1788630907
  });

  assert.equal(job.externalId, "senior-backend-developer-acme-123");
  assert.equal(job.source, "Arbeitnow");
  assert.equal(job.company, "Acme");
  assert.equal(job.remote, true);
  assert.equal(job.level, "senior");
  assert.equal(job.category, "backend");
  assert.deepEqual(job.technologies, ["TypeScript", "Node.js", "AWS"]);
  assert.equal(job.url, "https://www.arbeitnow.com/jobs/companies/acme/senior-backend-developer-acme-123");
  assert.equal(job.publishedAt?.toISOString(), new Date(1788630907 * 1000).toISOString());
});
