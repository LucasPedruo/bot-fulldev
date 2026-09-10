import assert from "node:assert/strict";
import { test } from "node:test";
import { buildClassificationPrompt, parseDecision } from "./moderation.classifier.js";

// Every one of these guards the same property: a deletion only happens on an unambiguous
// "remove". Three deletions cost somebody their place in the community, so any doubt - a broken
// response, a typo, an empty body - has to resolve to allowed.
void test("only an explicit remove deletes the message", () => {
  assert.equal(parseDecision('{"decision":"remove","reason":"papo furado"}').allowed, false);
  assert.equal(parseDecision('{"decision":"allow"}').allowed, true);
});

void test("keeps the reason the model gave", () => {
  assert.equal(parseDecision('{"decision":"remove","reason":"corrente"}').reason, "corrente");
});

void test("falls back to a generic reason when the model gives none", () => {
  const decision = parseDecision('{"decision":"remove"}');

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "off-topic");
});

void test("allows when the response is not valid JSON", () => {
  assert.equal(parseDecision("desculpe, não posso ajudar").allowed, true);
  assert.equal(parseDecision("{broken").allowed, true);
});

void test("allows when the response is empty or missing", () => {
  assert.equal(parseDecision(undefined).allowed, true);
  assert.equal(parseDecision("").allowed, true);
  assert.equal(parseDecision("{}").allowed, true);
});

void test("allows on any decision value other than remove", () => {
  assert.equal(parseDecision('{"decision":"REMOVE"}').allowed, true);
  assert.equal(parseDecision('{"decision":"delete"}').allowed, true);
  assert.equal(parseDecision('{"decision":true}').allowed, true);
  assert.equal(parseDecision('{"decision":null}').allowed, true);
});

void test("the prompt carries the message text", () => {
  assert.match(buildClassificationPrompt("vaga de dev junior"), /vaga de dev junior/);
});

void test("the prompt carries the image description when there is one", () => {
  // A job posted as a flyer has no text; judging it on the text alone would delete it for being
  // empty.
  const prompt = buildClassificationPrompt("", "Cartaz anunciando vaga de estágio em TI");

  assert.match(prompt, /Cartaz anunciando vaga de estágio em TI/);
  assert.match(prompt, /sem texto/);
});
