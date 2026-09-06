import assert from "node:assert/strict";
import { test } from "node:test";
import type { WAMessage } from "@whiskeysockets/baileys";
import { createNetworkingMessageListener, type NetworkingRepositoryLike, type QueueServiceLike } from "./message-listener.js";
import type { EnqueueMessageInput, QueueMessage, TextMessagePayload } from "../queue/queue.types.js";

const networkingGroups = ["120363000000000001@g.us", "120363000000000002@g.us"];
const botJid = "551100000000:1@s.whatsapp.net";

class FakeRepository implements NetworkingRepositoryLike {
  public touched: string[] = [];

  async touchActivity(groupJid: string): Promise<void> {
    await Promise.resolve();
    this.touched.push(groupJid);
  }
}

class FakeQueue implements QueueServiceLike {
  public enqueued: EnqueueMessageInput[] = [];

  async enqueue(input: EnqueueMessageInput): Promise<QueueMessage> {
    await Promise.resolve();
    this.enqueued.push(input);
    return {
      id: "queued-1",
      type: input.type,
      destinationGroup: input.destinationGroup,
      payload: input.payload,
      status: "pending",
      priority: input.priority ?? 0,
      scheduledFor: input.scheduledFor ?? new Date(),
      attempts: 0,
      createdAt: new Date(),
      sentAt: null,
      lastError: null,
      processingStartedAt: null
    };
  }
}

function buildMessage(input: {
  remoteJid: string;
  fromMe?: boolean;
  participant?: string;
  mentionedJid?: string[];
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
            text: "oi @bot",
            contextInfo: { mentionedJid: input.mentionedJid }
          }
        }
      : { conversation: "oi gente" }
  };
}

void test("ignores messages outside the configured networking groups", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const listener = createNetworkingMessageListener({ getBotJid: () => botJid, networkingGroups, repository, queue });

  await listener(buildMessage({ remoteJid: "120363999999999999@g.us" }));

  assert.deepEqual(repository.touched, []);
  assert.deepEqual(queue.enqueued, []);
});

void test("tracks activity for a plain networking-group message without replying", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const listener = createNetworkingMessageListener({ getBotJid: () => botJid, networkingGroups, repository, queue });

  await listener(buildMessage({ remoteJid: networkingGroups[0], participant: "5511999999999@s.whatsapp.net" }));

  assert.deepEqual(repository.touched, [networkingGroups[0]]);
  assert.deepEqual(queue.enqueued, []);
});

void test("replies with a mention when the bot is mentioned in a networking group", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const listener = createNetworkingMessageListener({ getBotJid: () => botJid, networkingGroups, repository, queue });

  await listener(
    buildMessage({
      remoteJid: networkingGroups[0],
      participant: "5511999999999@s.whatsapp.net",
      mentionedJid: ["5511000000000@s.whatsapp.net", "551100000000@s.whatsapp.net"]
    })
  );

  assert.deepEqual(repository.touched, [networkingGroups[0]]);
  assert.equal(queue.enqueued.length, 1);
  assert.equal(queue.enqueued[0].destinationGroup, networkingGroups[0]);
  assert.equal(queue.enqueued[0].type, "networking");
  assert.deepEqual((queue.enqueued[0].payload as TextMessagePayload).mentions, ["5511999999999@s.whatsapp.net"]);
});

void test("does not reply to its own messages even if they technically mention it", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const listener = createNetworkingMessageListener({ getBotJid: () => botJid, networkingGroups, repository, queue });

  await listener(
    buildMessage({
      remoteJid: networkingGroups[0],
      fromMe: true,
      mentionedJid: ["551100000000@s.whatsapp.net"]
    })
  );

  assert.deepEqual(repository.touched, [networkingGroups[0]]);
  assert.deepEqual(queue.enqueued, []);
});
