import type { WAMessage } from "@whiskeysockets/baileys";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEventQnaListener, type EventQnaServiceLike } from "./event-qna-listener.js";

const eventsGroup = "120363429019612420@g.us";
const botJid = "551100000000:1@s.whatsapp.net";
const botLid = "999888777:1@lid";
const getBotJids = () => [botJid, botLid];

class FakeService implements EventQnaServiceLike {
  public calls: Array<{ groupJid: string; text: string }> = [];

  async handleMessage(groupJid: string, text: string): Promise<void> {
    await Promise.resolve();
    this.calls.push({ groupJid, text });
  }
}

function buildMentionedMessage(overrides: Partial<WAMessage> & { text?: string; mentionedJid?: string[] } = {}): WAMessage {
  return {
    key: { remoteJid: eventsGroup, fromMe: false, id: "1" },
    message: {
      extendedTextMessage: {
        text: overrides.text ?? "tem evento em setembro?",
        contextInfo: { mentionedJid: overrides.mentionedJid ?? ["551100000000@s.whatsapp.net"] }
      }
    },
    ...overrides
  };
}

void test("ignores messages outside the configured events group", async () => {
  const service = new FakeService();
  const listener = createEventQnaListener({ eventsGroup, service, getBotJids });

  await listener(buildMentionedMessage({ key: { remoteJid: "other-group@g.us", fromMe: false, id: "1" } }));

  assert.equal(service.calls.length, 0);
});

void test("ignores its own messages", async () => {
  const service = new FakeService();
  const listener = createEventQnaListener({ eventsGroup, service, getBotJids });

  await listener(buildMentionedMessage({ key: { remoteJid: eventsGroup, fromMe: true, id: "1" } }));

  assert.equal(service.calls.length, 0);
});

void test("ignores messages in the events group that don't mention the bot", async () => {
  const service = new FakeService();
  const listener = createEventQnaListener({ eventsGroup, service, getBotJids });

  await listener({
    key: { remoteJid: eventsGroup, fromMe: false, id: "1" },
    message: { conversation: "tá resetando a cada validade de evento?" }
  });

  assert.equal(service.calls.length, 0);
});

void test("answers when the bot is mentioned via its phone-number JID", async () => {
  const service = new FakeService();
  const listener = createEventQnaListener({ eventsGroup, service, getBotJids });

  await listener(buildMentionedMessage({ mentionedJid: ["551100000000@s.whatsapp.net"] }));

  assert.deepEqual(service.calls, [{ groupJid: eventsGroup, text: "tem evento em setembro?" }]);
});

void test("answers when the bot is mentioned via its LID", async () => {
  const service = new FakeService();
  const listener = createEventQnaListener({ eventsGroup, service, getBotJids });

  await listener(buildMentionedMessage({ mentionedJid: ["999888777@lid"] }));

  assert.deepEqual(service.calls, [{ groupJid: eventsGroup, text: "tem evento em setembro?" }]);
});

void test("ignores messages that mention someone else, not the bot", async () => {
  const service = new FakeService();
  const listener = createEventQnaListener({ eventsGroup, service, getBotJids });

  await listener(buildMentionedMessage({ mentionedJid: ["5521999999999@s.whatsapp.net"] }));

  assert.equal(service.calls.length, 0);
});

void test("ignores mentioned messages with no text content", async () => {
  const service = new FakeService();
  const listener = createEventQnaListener({ eventsGroup, service, getBotJids });

  await listener({
    key: { remoteJid: eventsGroup, fromMe: false, id: "1" },
    message: { extendedTextMessage: { contextInfo: { mentionedJid: ["551100000000@s.whatsapp.net"] } } }
  });

  assert.equal(service.calls.length, 0);
});
