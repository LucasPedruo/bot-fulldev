import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAmbientReactionPrompt, buildAmbientReplyPrompt } from "./ambient-ai.provider.js";

void test("buildAmbientReplyPrompt includes the original message", () => {
  const prompt = buildAmbientReplyPrompt("alguém sabe uma boa lib de datas?");

  assert.match(prompt, /alguém sabe uma boa lib de datas\?/);
});

void test("buildAmbientReactionPrompt includes the original message and the NONE fallback instruction", () => {
  const prompt = buildAmbientReactionPrompt("consegui minha primeira vaga!");

  assert.match(prompt, /consegui minha primeira vaga!/);
  assert.match(prompt, /NONE/);
});
