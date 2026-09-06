import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMentionPrompt } from "./mention-ai.provider.js";

void test("buildMentionPrompt includes the original message when present", () => {
  const prompt = buildMentionPrompt("qual editor vocês usam?");

  assert.match(prompt, /qual editor vocês usam\?/);
});

void test("buildMentionPrompt falls back to a generic prompt with no message text", () => {
  const prompt = buildMentionPrompt(undefined);

  assert.match(prompt, /sem mais contexto/);
});

void test("buildMentionPrompt treats a blank message the same as no message", () => {
  const prompt = buildMentionPrompt("   ");

  assert.match(prompt, /sem mais contexto/);
});
