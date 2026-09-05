import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeRemoteokJob } from "./remoteok.provider.js";

void test("normalizeRemoteokJob maps RemoteOK payload to normalized job", () => {
  const job = normalizeRemoteokJob({
    id: 1137307,
    slug: "senior-backend-developer-acme",
    url: "https://remoteOK.com/remote-jobs/senior-backend-developer-acme?utm_source=api",
    apply_url: undefined,
    position: "Senior Backend Developer",
    company: "Acme ",
    tags: ["node", "typescript", "aws", "backend"],
    location: "Worldwide",
    date: "2026-09-05T12:00:00+00:00",
    description: "<p>Build APIs with Node.js and TypeScript.</p>"
  });

  assert.equal(job.externalId, "1137307");
  assert.equal(job.source, "RemoteOK");
  assert.equal(job.company, "Acme");
  assert.equal(job.remote, true);
  assert.equal(job.level, "senior");
  assert.equal(job.category, "backend");
  assert.deepEqual(job.technologies, ["TypeScript", "Node.js", "AWS"]);
  assert.equal(job.url, "https://remoteok.com/remote-jobs/senior-backend-developer-acme");
});

void test("normalizeRemoteokJob falls back to a slug-based url when apply_url and url are missing", () => {
  const job = normalizeRemoteokJob({
    id: 42,
    slug: "frontend-engineer-acme",
    url: undefined,
    apply_url: undefined,
    position: "Frontend Engineer",
    company: "Acme",
    tags: ["react"],
    location: "",
    date: undefined,
    description: ""
  });

  assert.equal(job.url, "https://remoteok.com/remote-jobs/frontend-engineer-acme");
  assert.equal(job.location, undefined);
});
