import assert from "node:assert/strict";
import { test } from "node:test";
import type { WAMessage } from "@whiskeysockets/baileys";
import { createJobsModerationListener } from "./moderation-listener.js";
import type { StrikeOutcome } from "./moderation.service.js";

const jobsGroup = "120363391901542507@g.us";
const member = "5511987654321@s.whatsapp.net";
const admin = "5521999998888@s.whatsapp.net";

class FakeService {
  public punished: Array<{ groupJid: string; participantJid: string; reason: string }> = [];

  async punish(input: { groupJid: string; participantJid: string; reason: string }): Promise<StrikeOutcome> {
    await Promise.resolve();
    this.punished.push({ groupJid: input.groupJid, participantJid: input.participantJid, reason: input.reason });
    return { strikes: 1, limit: 3, removed: false };
  }
}

function buildMessage(overrides: {
  remoteJid?: string;
  participant?: string;
  fromMe?: boolean;
  text?: string;
  image?: boolean;
  sticker?: boolean;
}): WAMessage {
  const { remoteJid = jobsGroup, participant = member, fromMe = false, text, image, sticker } = overrides;
  const message = sticker
    ? { stickerMessage: { mimetype: "image/webp" } }
    : image
      ? { imageMessage: { mimetype: "image/jpeg" } }
      : { conversation: text ?? "" };

  return {
    key: { remoteJid, participant, fromMe, id: "MSG1" },
    message
  };
}

const alwaysAdmin = async (): Promise<boolean> => Promise.resolve(true);
const neverAdmin = async (): Promise<boolean> => Promise.resolve(false);
const noMedia = async (): Promise<string | undefined> => Promise.resolve(undefined);

function buildListener(
  service: FakeService,
  overrides: {
    classify?: (text: string, description?: string) => Promise<{ allowed: boolean; reason: string }>;
    isGroupAdmin?: (groupJid: string, senderJid: string) => Promise<boolean>;
    describeMedia?: (message: WAMessage) => Promise<string | undefined>;
  } = {}
) {
  return createJobsModerationListener({
    jobsGroups: [jobsGroup],
    service,
    isGroupAdmin: overrides.isGroupAdmin ?? neverAdmin,
    describeMedia: overrides.describeMedia ?? noMedia,
    classify: overrides.classify ?? (async () => Promise.resolve({ allowed: false, reason: "papo furado" }))
  });
}

void test("punishes an off-topic message from a regular member", async () => {
  const service = new FakeService();

  await buildListener(service)(buildMessage({ text: "bom dia pessoal" }));

  assert.equal(service.punished.length, 1);
  assert.equal(service.punished[0].participantJid, member);
  assert.equal(service.punished[0].reason, "papo furado");
});

void test("never moderates an admin", async () => {
  const service = new FakeService();

  await buildListener(service, { isGroupAdmin: alwaysAdmin })(
    buildMessage({ participant: admin, text: "bom dia pessoal" })
  );

  assert.deepEqual(service.punished, []);
});

void test("leaves an allowed message alone", async () => {
  const service = new FakeService();

  await buildListener(service, { classify: async () => Promise.resolve({ allowed: true, reason: "vaga" }) })(
    buildMessage({ text: "Vaga de dev junior, remoto" })
  );

  assert.deepEqual(service.punished, []);
});

void test("ignores messages from groups that are not jobs groups", async () => {
  const service = new FakeService();

  await buildListener(service)(buildMessage({ remoteJid: "120363306015581649@g.us", text: "bom dia" }));

  assert.deepEqual(service.punished, []);
});

void test("ignores its own messages", async () => {
  const service = new FakeService();

  await buildListener(service)(buildMessage({ fromMe: true, text: "bom dia" }));

  assert.deepEqual(service.punished, []);
});

void test("does nothing when the admin list cannot be read", async () => {
  const service = new FakeService();
  const failing = async (): Promise<boolean> => Promise.reject(new Error("offline"));

  // Acting blind could delete a moderator's message, so silence is the safe failure.
  await assert.doesNotReject(() => buildListener(service, { isGroupAdmin: failing })(buildMessage({ text: "oi" })));
  assert.deepEqual(service.punished, []);
});

void test("judges a flyer by its description instead of deleting it for being empty", async () => {
  const service = new FakeService();
  const seen: Array<string | undefined> = [];

  await buildListener(service, {
    describeMedia: async () => Promise.resolve("Cartaz anunciando vaga de estágio em TI"),
    classify: async (_text, description) => {
      seen.push(description);
      return Promise.resolve({ allowed: true, reason: "vaga em imagem" });
    }
  })(buildMessage({ image: true }));

  assert.deepEqual(seen, ["Cartaz anunciando vaga de estágio em TI"]);
  assert.deepEqual(service.punished, []);
});

void test("skips a message with neither text nor a describable image", async () => {
  const service = new FakeService();
  let classified = false;

  await buildListener(service, {
    classify: async () => {
      classified = true;
      return Promise.resolve({ allowed: false, reason: "x" });
    }
  })(buildMessage({ text: "" }));

  assert.equal(classified, false);
  assert.deepEqual(service.punished, []);
});

void test("deletes a sticker even when it cannot be described", async () => {
  const service = new FakeService();
  let classified = false;

  // The production failure: the media host in the proto no longer resolved, the description came
  // back empty, and the listener gave up - so a sticker sat in the jobs group untouched.
  await buildListener(service, {
    describeMedia: async () => Promise.resolve(undefined),
    classify: async () => {
      classified = true;
      return Promise.resolve({ allowed: true, reason: "nunca deve ser consultado" });
    }
  })(buildMessage({ sticker: true }));

  assert.equal(service.punished.length, 1);
  assert.equal(service.punished[0].reason, "figurinha");
  // A sticker is off-topic by construction, so the classifier is not even asked.
  assert.equal(classified, false);
});

void test("deletes a sticker without ever downloading it", async () => {
  const service = new FakeService();
  let downloaded = false;

  await buildListener(service, {
    describeMedia: async () => {
      downloaded = true;
      return Promise.resolve("um passarinho verde");
    }
  })(buildMessage({ sticker: true }));

  assert.equal(service.punished.length, 1);
  assert.equal(downloaded, false);
});

void test("an admin's sticker is still left alone", async () => {
  const service = new FakeService();

  await buildListener(service, { isGroupAdmin: alwaysAdmin })(buildMessage({ participant: admin, sticker: true }));

  assert.deepEqual(service.punished, []);
});

void test("keeps an image it could not describe instead of deleting blind", async () => {
  const service = new FakeService();

  // It could be a flyer with a real vacancy; deleting on a failed download would punish someone
  // for our own outage.
  await buildListener(service, { describeMedia: async () => Promise.resolve(undefined) })(
    buildMessage({ image: true })
  );

  assert.deepEqual(service.punished, []);
});
