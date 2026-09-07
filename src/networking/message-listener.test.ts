import assert from "node:assert/strict";
import { test } from "node:test";
import type { WAMessage } from "@whiskeysockets/baileys";
import {
  createNetworkingMessageListener,
  type MentionReplyServiceLike,
  type NetworkingRepositoryLike
} from "./message-listener.js";

const networkingGroups = ["120363000000000001@g.us", "120363000000000002@g.us"];
const botJid = "551100000000:1@s.whatsapp.net";
const botLid = "999888777:1@lid";
const getBotJids = () => [botJid, botLid];

class FakeRepository implements NetworkingRepositoryLike {
  public touched: string[] = [];

  async touchActivity(groupJid: string): Promise<void> {
    await Promise.resolve();
    this.touched.push(groupJid);
  }
}

class FakeMentionService implements MentionReplyServiceLike {
  public handled: Array<{ groupJid: string; senderJid: string; messageText?: string }> = [];

  async handleMention(groupJid: string, senderJid: string, messageText?: string): Promise<void> {
    await Promise.resolve();
    this.handled.push({ groupJid, senderJid, messageText });
  }
}

function buildMessage(input: {
  remoteJid: string;
  fromMe?: boolean;
  participant?: string;
  mentionedJid?: string[];
  text?: string;
}): WAMessage {
  return {
    key: {
      remoteJid: input.remoteJid,
      fromMe: input.fromMe ?? false,
      participant: input.participant
    },
    message: input.mentionedJid
      ? {
          extendedTextMessage: {
            text: input.text ?? "oi @bot",
            contextInfo: { mentionedJid: input.mentionedJid }
          }
        }
      : { conversation: input.text ?? "oi gente" }
  };
}

void test("ignores messages outside the configured networking groups", async () => {
  const repository = new FakeRepository();
  const mentionService = new FakeMentionService();
  const listener = createNetworkingMessageListener({ getBotJids, networkingGroups, repository, mentionService });

  await listener(buildMessage({ remoteJid: "120363999999999999@g.us" }));

  assert.deepEqual(repository.touched, []);
  assert.deepEqual(mentionService.handled, []);
});

void test("tracks activity for a plain networking-group message without replying", async () => {
  const repository = new FakeRepository();
  const mentionService = new FakeMentionService();
  const listener = createNetworkingMessageListener({ getBotJids, networkingGroups, repository, mentionService });

  await listener(buildMessage({ remoteJid: networkingGroups[0], participant: "5511999999999@s.whatsapp.net" }));

  assert.deepEqual(repository.touched, [networkingGroups[0]]);
  assert.deepEqual(mentionService.handled, []);
});

void test("delegates to the mention service when the bot is mentioned in a networking group", async () => {
  const repository = new FakeRepository();
  const mentionService = new FakeMentionService();
  const listener = createNetworkingMessageListener({ getBotJids, networkingGroups, repository, mentionService });

  await listener(
    buildMessage({
      remoteJid: networkingGroups[0],
      participant: "5511999999999@s.whatsapp.net",
      mentionedJid: ["5511000000000@s.whatsapp.net", "551100000000@s.whatsapp.net"]
    })
  );

  assert.deepEqual(repository.touched, [networkingGroups[0]]);
  assert.deepEqual(mentionService.handled, [
    { groupJid: networkingGroups[0], senderJid: "5511999999999@s.whatsapp.net", messageText: "oi @bot" }
  ]);
});

void test("recognizes a mention that uses the bot's LID instead of its phone-number JID", async () => {
  const repository = new FakeRepository();
  const mentionService = new FakeMentionService();
  const listener = createNetworkingMessageListener({ getBotJids, networkingGroups, repository, mentionService });

  await listener(
    buildMessage({
      remoteJid: networkingGroups[0],
      participant: "162783622594588@lid",
      mentionedJid: ["999888777@lid"]
    })
  );

  assert.deepEqual(mentionService.handled, [
    { groupJid: networkingGroups[0], senderJid: "162783622594588@lid", messageText: "oi @bot" }
  ]);
});

void test("resolves the sender's LID to a phone-number JID before delegating", async () => {
  const repository = new FakeRepository();
  const mentionService = new FakeMentionService();
  const listener = createNetworkingMessageListener({
    getBotJids,
    networkingGroups,
    repository,
    mentionService,
    resolveSenderJid: async (jid) => {
      await Promise.resolve();
      return jid === "162783622594588@lid" ? "5511999999999@s.whatsapp.net" : jid;
    }
  });

  await listener(
    buildMessage({
      remoteJid: networkingGroups[0],
      participant: "162783622594588@lid",
      mentionedJid: ["999888777@lid"]
    })
  );

  assert.deepEqual(mentionService.handled, [
    { groupJid: networkingGroups[0], senderJid: "5511999999999@s.whatsapp.net", messageText: "oi @bot" }
  ]);
});

void test("passes the actual mention message text through to the mention service", async () => {
  const repository = new FakeRepository();
  const mentionService = new FakeMentionService();
  const listener = createNetworkingMessageListener({ getBotJids, networkingGroups, repository, mentionService });

  await listener(
    buildMessage({
      remoteJid: networkingGroups[0],
      participant: "5511999999999@s.whatsapp.net",
      mentionedJid: ["551100000000@s.whatsapp.net"],
      text: "qual editor vocês usam?"
    })
  );

  assert.deepEqual(mentionService.handled, [
    { groupJid: networkingGroups[0], senderJid: "5511999999999@s.whatsapp.net", messageText: "qual editor vocês usam?" }
  ]);
});

void test("does not delegate for its own messages even if they technically mention it", async () => {
  const repository = new FakeRepository();
  const mentionService = new FakeMentionService();
  const listener = createNetworkingMessageListener({ getBotJids, networkingGroups, repository, mentionService });

  await listener(
    buildMessage({
      remoteJid: networkingGroups[0],
      fromMe: true,
      mentionedJid: ["551100000000@s.whatsapp.net"]
    })
  );

  assert.deepEqual(repository.touched, [networkingGroups[0]]);
  assert.deepEqual(mentionService.handled, []);
});
