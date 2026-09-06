import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWelcomeMessage, pickGoodbyeMessage, pickIdleContent, pickMentionCooldownMessage, pickMentionReply } from "./idle-content.js";

void test("pickIdleContent always returns a well-formed joke, critique, or poll", () => {
  for (let i = 0; i < 50; i += 1) {
    const content = pickIdleContent();

    assert.ok(["joke", "critique", "poll"].includes(content.type));

    if (content.type === "poll") {
      assert.ok(content.name.length > 0);
      assert.ok(content.values.length >= 2 && content.values.length <= 4);
      assert.equal(new Set(content.values).size, content.values.length);
    } else {
      assert.ok(content.text.length > 0);
    }
  }
});

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
