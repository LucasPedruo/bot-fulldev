import assert from "node:assert/strict";
import { test } from "node:test";
import type { WAMessage } from "@whiskeysockets/baileys";
import type { EnqueueMessageInput, QueueMessage, TextMessagePayload } from "../queue/queue.types.js";
import {
  createImageDescriptionListener,
  findDescribableMedia,
  type QueueServiceLike
} from "./image-description-listener.js";

const groupJid = "120363306015581649@g.us";

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
      bypassQuietHours: input.bypassQuietHours ?? false,
      scheduledFor: input.scheduledFor ?? new Date(),
      attempts: 0,
      createdAt: new Date(),
      sentAt: null,
      lastError: null,
      processingStartedAt: null
    };
  }
}

function buildMessage(content: WAMessage["message"], overrides: Partial<WAMessage["key"]> = {}): WAMessage {
  return {
    key: { remoteJid: groupJid, participant: "5511987654321@s.whatsapp.net", fromMe: false, id: "MSG1", ...overrides },
    message: content
  };
}

const download = async (): Promise<Buffer> => Promise.resolve(Buffer.from("fake-bytes"));

function buildListener(queue: FakeQueue, describe = async (): Promise<string | undefined> => Promise.resolve("um gráfico de barras")) {
  return createImageDescriptionListener({ queue, download, describe });
}

void test("finds an image and its caption", () => {
  const media = findDescribableMedia(buildMessage({ imageMessage: { mimetype: "image/png", caption: "olha isso" } }));

  assert.equal(media?.mimeType, "image/png");
  assert.equal(media?.isSticker, false);
  assert.equal(media?.caption, "olha isso");
});

void test("finds a sticker and marks it as one", () => {
  const media = findDescribableMedia(buildMessage({ stickerMessage: { mimetype: "image/webp" } }));

  assert.equal(media?.isSticker, true);
  assert.equal(media?.mimeType, "image/webp");
});

void test("ignores media it cannot describe", () => {
  assert.equal(findDescribableMedia(buildMessage({ conversation: "texto" })), undefined);
  assert.equal(findDescribableMedia(buildMessage({ audioMessage: {} })), undefined);
  assert.equal(findDescribableMedia(buildMessage({ videoMessage: {} })), undefined);
  assert.equal(findDescribableMedia(buildMessage(null)), undefined);
});

void test("posts the description back into the group", async () => {
  const queue = new FakeQueue();

  await buildListener(queue)(buildMessage({ imageMessage: { mimetype: "image/jpeg" } }));

  assert.equal(queue.enqueued.length, 1);
  assert.equal(queue.enqueued[0].destinationGroup, groupJid);
  const text = (queue.enqueued[0].payload as TextMessagePayload).text;
  assert.match(text, /Descrição da imagem/);
  assert.match(text, /um gráfico de barras/);
});

void test("describes stickers too", async () => {
  const queue = new FakeQueue();

  await buildListener(queue)(buildMessage({ stickerMessage: { mimetype: "image/webp" } }));

  assert.equal(queue.enqueued.length, 1);
});

void test("does not describe its own images", async () => {
  const queue = new FakeQueue();

  await buildListener(queue)(buildMessage({ imageMessage: {} }, { fromMe: true }));

  // Otherwise the bot would describe the images it posts itself.
  assert.deepEqual(queue.enqueued, []);
});

void test("ignores direct messages, only groups are covered", async () => {
  const queue = new FakeQueue();

  await buildListener(queue)(buildMessage({ imageMessage: {} }, { remoteJid: "5511987654321@s.whatsapp.net" }));

  assert.deepEqual(queue.enqueued, []);
});

void test("stays silent when the model returns nothing", async () => {
  const queue = new FakeQueue();
  const listener = createImageDescriptionListener({
    queue,
    download,
    describe: async () => Promise.resolve(undefined)
  });

  await listener(buildMessage({ imageMessage: {} }));

  assert.deepEqual(queue.enqueued, []);
});

void test("a failed download never rejects the handler", async () => {
  const queue = new FakeQueue();
  const listener = createImageDescriptionListener({
    queue,
    download: async () => Promise.reject(new Error("media expired")),
    describe: async () => Promise.resolve("nunca chega aqui")
  });

  await assert.doesNotReject(() => listener(buildMessage({ imageMessage: {} })));
  assert.deepEqual(queue.enqueued, []);
});

void test("the description skips the quiet-hours hold", async () => {
  const queue = new FakeQueue();

  await buildListener(queue)(buildMessage({ imageMessage: {} }));

  // It is only useful next to the image it describes.
  assert.equal(queue.enqueued[0].bypassQuietHours, true);
});
