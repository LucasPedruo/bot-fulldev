import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWelcomeMessage, pickGoodbyeMessage, pickMentionCooldownMessage, pickMentionReply } from "./idle-content.js";

void test("pickMentionReply always returns non-empty text", () => {
  for (let i = 0; i < 20; i += 1) {
    const reply = pickMentionReply();
    assert.ok(reply.length > 0);
  }
});

void test("pickMentionCooldownMessage includes the given hour count", () => {
  for (let i = 0; i < 20; i += 1) {
    const message = pickMentionCooldownMessage(3);
    assert.match(message, /3h/);
  }
});

void test("buildWelcomeMessage tags every new participant", () => {
  const { text, mentions } = buildWelcomeMessage(["5511999999999@s.whatsapp.net", "5521988888888@s.whatsapp.net"]);

  assert.match(text, /@5511999999999/);
  assert.match(text, /@5521988888888/);
  assert.deepEqual(mentions, ["5511999999999@s.whatsapp.net", "5521988888888@s.whatsapp.net"]);
});

void test("pickGoodbyeMessage always returns non-empty text", () => {
  for (let i = 0; i < 20; i += 1) {
    assert.ok(pickGoodbyeMessage().length > 0);
  }
});
