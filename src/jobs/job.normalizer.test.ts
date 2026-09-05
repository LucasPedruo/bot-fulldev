import assert from "node:assert/strict";
import { test } from "node:test";
import { createJobFingerprint, extractTechnologies, inferCategory, inferLevel, normalizeUrl } from "./job.normalizer.js";

void test("normalizeUrl removes tracking parameters and fragments", () => {
  const url = normalizeUrl("https://example.com/job?utm_source=x&gclid=abc&id=123#section");

  assert.equal(url, "https://example.com/job?id=123");
});

void test("createJobFingerprint is stable for equivalent input", () => {
  const first = createJobFingerprint({
    company: "Acme Corp",
    title: "Senior Frontend Developer",
    url: "https://example.com/job?utm_campaign=test&id=1"
  });
  const second = createJobFingerprint({
    company: " acme  corp ",
    title: "Senior Frontend Developer",
    url: "https://example.com/job?id=1"
  });

  assert.equal(first, second);
});

void test("inferLevel maps common seniority labels", () => {
  assert.equal(inferLevel("Senior Software Engineer"), "senior");
  assert.equal(inferLevel("Jr Front-end Developer"), "junior");
  assert.equal(inferLevel("Pessoa Desenvolvedora Pleno"), "mid");
  assert.equal(inferLevel("Estagio em QA"), "intern");
  assert.equal(inferLevel("Pessoa Estagiária de Governança de SI"), "intern");
});

void test("inferCategory maps technology text to category", () => {
  assert.equal(inferCategory("React TypeScript UI Engineer"), "frontend");
  assert.equal(inferCategory("Node.js API Backend Engineer"), "backend");
  assert.equal(inferCategory("Flutter Mobile Developer"), "mobile");
  assert.equal(inferCategory("Cientista de Dados Pleno"), "data");
});

void test("extractTechnologies returns unique known technologies", () => {
  assert.deepEqual(extractTechnologies("React, React.js, TypeScript and Next.js"), ["React", "TypeScript", "Next.js"]);
});
