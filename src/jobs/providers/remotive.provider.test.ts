import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeRemotiveJob } from "./remotive.provider.js";

void test("normalizeRemotiveJob maps Remotive payload to normalized job", () => {
  const job = normalizeRemotiveJob({
    id: 123,
    url: "https://remotive.com/remote-jobs/software-dev/backend-developer-123?utm_source=test",
    title: "Senior Backend Developer",
    company_name: "Acme ",
    category: "Software Development",
    tags: ["node", "typescript", "aws"],
    job_type: "full_time",
    publication_date: "2026-09-05T12:00:00",
    candidate_required_location: "LATAM",
    description: "<p>Build APIs with Node.js and TypeScript.</p>"
  });

  assert.equal(job.externalId, "123");
  assert.equal(job.source, "Remotive");
  assert.equal(job.company, "Acme");
  assert.equal(job.remote, true);
  assert.equal(job.level, "senior");
  assert.equal(job.category, "backend");
  assert.deepEqual(job.technologies, ["TypeScript", "Node.js", "AWS"]);
  assert.equal(job.url, "https://remotive.com/remote-jobs/software-dev/backend-developer-123");
});
