import assert from "node:assert/strict";
import { test } from "node:test";
import { parseJobQuery } from "./job-query.js";

void test("parseJobQuery extracts level and category from a free-text question", () => {
  assert.deepEqual(parseJobQuery("me diga vagas de junior frontend"), { level: "junior", category: "frontend" });
});

void test("parseJobQuery extracts just the level when no category keyword is present", () => {
  assert.deepEqual(parseJobQuery("tem vaga pleno?"), { level: "mid", category: undefined });
});

void test("parseJobQuery extracts just the category when no level keyword is present", () => {
  assert.deepEqual(parseJobQuery("vagas de backend"), { level: undefined, category: "backend" });
});

void test("parseJobQuery returns no criteria for a generic question", () => {
  assert.deepEqual(parseJobQuery("tem vaga?"), { level: undefined, category: undefined });
});

void test("parseJobQuery does not mistake the interjection 'aí' for the AI/data category", () => {
  assert.deepEqual(parseJobQuery("e aí, tem vaga?"), { level: undefined, category: undefined });
});
