import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMentionPrompt } from "./mention-ai.provider.js";
import { buildPersonaSystemPrompt, COMMUNITY_CONTEXT, PERSONA_LORE, PERSONA_NAME, PERSONALITY_TRAITS } from "./persona.js";

void test("the system prompt names the bot and its role in the community", () => {
  const prompt = buildPersonaSystemPrompt();

  assert.match(prompt, new RegExp(PERSONA_NAME));
  assert.match(prompt, /sentinela/i);
  assert.match(prompt, /pato dev/i);
  assert.match(prompt, /FullDev/);
});

void test("the system prompt carries what the FullDev community is", () => {
  const prompt = buildPersonaSystemPrompt();

  assert.ok(prompt.includes(COMMUNITY_CONTEXT));
  assert.match(prompt, /networking/i);
  assert.match(prompt, /aprendizado coletivo/i);
  assert.match(prompt, /carreira/i);
});

void test("the system prompt lists every personality trait", () => {
  const prompt = buildPersonaSystemPrompt();

  for (const trait of PERSONALITY_TRAITS) {
    assert.ok(prompt.includes(trait), `missing trait: ${trait}`);
  }
});

void test("the system prompt carries Quackson's lore", () => {
  const prompt = buildPersonaSystemPrompt();

  for (const lore of PERSONA_LORE) {
    assert.ok(prompt.includes(lore), `missing lore: ${lore}`);
  }

  assert.match(prompt, /100 mil anos/i);
  assert.match(prompt, /vibecoders/i);
  assert.match(prompt, /Vasco da Gama/i);
  assert.match(prompt, /Naruto/);
  assert.match(prompt, /One Piece/);
  assert.match(prompt, /Ragnarok/);
});

void test("the answering rule and the output format survive the persona rewrite", () => {
  const prompt = buildPersonaSystemPrompt();

  // The regression this guards: a richer persona tempting the model to perform instead of answer.
  assert.match(prompt, /REGRA MAIS IMPORTANTE/);
  assert.match(prompt, /português do Brasil/i);
  assert.match(prompt, /idioma em que a pessoa falou/i);
  assert.match(prompt, /markdown/i);
  assert.match(prompt, /35 palavras/);
});

void test("the word budget is configurable", () => {
  assert.match(buildPersonaSystemPrompt({ maxWords: 60 }), /60 palavras/);
});

void test("the mention prompt still echoes the message it must answer", () => {
  assert.match(buildMentionPrompt("como faço deploy?"), /como faço deploy\?/);
  assert.match(buildMentionPrompt(), /sem mais contexto/i);
});
