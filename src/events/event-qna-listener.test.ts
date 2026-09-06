import type { WAMessage } from "@whiskeysockets/baileys";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEventQnaListener, type EventQnaServiceLike } from "./event-qna-listener.js";

const eventsGroup = "120363429019612420@g.us";

class FakeService implements EventQnaServiceLike {
  public calls: Array<{ groupJid: string; text: string }> = [];

  async handleMessage(groupJid: string, text: string): Promise<boolean> {
    await Promise.resolve();
    this.calls.push({ groupJid, text });
    return true;
  }
}

function buildMessage(overrides: Partial<WAMessage>): WAMessage {
  return {
    key: { remoteJid: eventsGroup, fromMe: false, id: "1" },
    message: { conversation: "tem evento em setembro?" },
    ...overrides
  };
}

void test("ignores messages outside the configured events group", async () => {
  const service = new FakeService();
  const listener = createEventQnaListener({ eventsGroup, service });

  await listener(buildMessage({ key: { remoteJid: "other-group@g.us", fromMe: false, id: "1" } }));

  assert.equal(service.calls.length, 0);
});

void test("ignores its own messages", async () => {
  const service = new FakeService();
  const listener = createEventQnaListener({ eventsGroup, service });

  await listener(buildMessage({ key: { remoteJid: eventsGroup, fromMe: true, id: "1" } }));

  assert.equal(service.calls.length, 0);
});

void test("forwards conversation text from the events group to the service", async () => {
  const service = new FakeService();
  const listener = createEventQnaListener({ eventsGroup, service });

  await listener(buildMessage({}));

  assert.deepEqual(service.calls, [{ groupJid: eventsGroup, text: "tem evento em setembro?" }]);
});

void test("falls back to extendedTextMessage text when conversation is absent", async () => {
  const service = new FakeService();
  const listener = createEventQnaListener({ eventsGroup, service });

  await listener(
    buildMessage({
      message: { extendedTextMessage: { text: "tem evento em outubro?" } }
    })
  );

  assert.deepEqual(service.calls, [{ groupJid: eventsGroup, text: "tem evento em outubro?" }]);
});

void test("ignores messages with no text content", async () => {
  const service = new FakeService();
  const listener = createEventQnaListener({ eventsGroup, service });

  await listener(buildMessage({ message: {} }));

  assert.equal(service.calls.length, 0);
});
