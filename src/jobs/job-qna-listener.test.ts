import type { WAMessage } from "@whiskeysockets/baileys";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createJobQnaListener, type JobQnaServiceLike } from "./job-qna-listener.js";

const jobsGroups = ["120363391901542507@g.us", "120363417654610744@g.us"];
const botJid = "551100000000:1@s.whatsapp.net";
const botLid = "999888777:1@lid";
const getBotJids = () => [botJid, botLid];

class FakeService implements JobQnaServiceLike {
  public calls: Array<{ groupJid: string; text: string }> = [];

  async handleMessage(groupJid: string, text: string): Promise<void> {
    await Promise.resolve();
    this.calls.push({ groupJid, text });
  }
}

function buildMentionedMessage(overrides: Partial<WAMessage> & { text?: string; mentionedJid?: string[] } = {}): WAMessage {
  return {
    key: { remoteJid: jobsGroups[0], fromMe: false, id: "1" },
    message: {
      extendedTextMessage: {
        text: overrides.text ?? "vagas de junior frontend?",
        contextInfo: { mentionedJid: overrides.mentionedJid ?? ["551100000000@s.whatsapp.net"] }
      }
    },
    ...overrides
  };
}

void test("ignores messages outside the configured jobs groups", async () => {
  const service = new FakeService();
  const listener = createJobQnaListener({ jobsGroups, service, getBotJids });

  await listener(buildMentionedMessage({ key: { remoteJid: "other-group@g.us", fromMe: false, id: "1" } }));

  assert.equal(service.calls.length, 0);
});

void test("ignores its own messages", async () => {
  const service = new FakeService();
  const listener = createJobQnaListener({ jobsGroups, service, getBotJids });

  await listener(buildMentionedMessage({ key: { remoteJid: jobsGroups[0], fromMe: true, id: "1" } }));

  assert.equal(service.calls.length, 0);
});

void test("ignores messages in a jobs group that don't mention the bot", async () => {
  const service = new FakeService();
  const listener = createJobQnaListener({ jobsGroups, service, getBotJids });

  await listener({
    key: { remoteJid: jobsGroups[0], fromMe: false, id: "1" },
    message: { conversation: "alguem sabe se essa vaga junior ainda ta aberta?" }
  });

  assert.equal(service.calls.length, 0);
});

void test("answers when the bot is mentioned in either configured jobs group", async () => {
  const service = new FakeService();
  const listener = createJobQnaListener({ jobsGroups, service, getBotJids });

  await listener(buildMentionedMessage({ key: { remoteJid: jobsGroups[1], fromMe: false, id: "1" } }));

  assert.deepEqual(service.calls, [{ groupJid: jobsGroups[1], text: "vagas de junior frontend?" }]);
});

void test("answers when the bot is mentioned via its LID", async () => {
  const service = new FakeService();
  const listener = createJobQnaListener({ jobsGroups, service, getBotJids });

  await listener(buildMentionedMessage({ mentionedJid: ["999888777@lid"] }));

  assert.deepEqual(service.calls, [{ groupJid: jobsGroups[0], text: "vagas de junior frontend?" }]);
});

void test("ignores messages that mention someone else, not the bot", async () => {
  const service = new FakeService();
  const listener = createJobQnaListener({ jobsGroups, service, getBotJids });

  await listener(buildMentionedMessage({ mentionedJid: ["5521999999999@s.whatsapp.net"] }));

  assert.equal(service.calls.length, 0);
});

void test("ignores mentioned messages with no text content", async () => {
  const service = new FakeService();
  const listener = createJobQnaListener({ jobsGroups, service, getBotJids });

  await listener({
    key: { remoteJid: jobsGroups[0], fromMe: false, id: "1" },
    message: { extendedTextMessage: { contextInfo: { mentionedJid: ["551100000000@s.whatsapp.net"] } } }
  });

  assert.equal(service.calls.length, 0);
});
