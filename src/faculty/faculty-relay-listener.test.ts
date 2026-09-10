import assert from "node:assert/strict";
import { test } from "node:test";
import type { WAMessage } from "@whiskeysockets/baileys";
import { createAdminChecker, createFacultyRelayListener } from "./faculty-relay-listener.js";

const sourceGroup = "120363000000000008@g.us";
const admin = "5531988887777@s.whatsapp.net";
const student = "5511999996666@s.whatsapp.net";

class FakeService {
  public ingested: string[] = [];

  ingest(text: string): void {
    this.ingested.push(text);
  }
}

function buildMessage(overrides: {
  remoteJid?: string;
  participant?: string;
  fromMe?: boolean;
  text?: string;
  caption?: string;
}): WAMessage {
  const { remoteJid = sourceGroup, participant = admin, fromMe = false, text, caption } = overrides;

  return {
    key: { remoteJid, participant, fromMe, id: "MSG1" },
    message: caption ? { imageMessage: { caption } } : { conversation: text ?? "" }
  };
}

function buildListener(service: FakeService, isAdmin: (groupJid: string, senderJid: string) => Promise<boolean>) {
  return createFacultyRelayListener({ sourceGroup, service, isGroupAdmin: isAdmin });
}

const alwaysAdmin = async (): Promise<boolean> => Promise.resolve(true);
const neverAdmin = async (): Promise<boolean> => Promise.resolve(false);

void test("ingests a message sent by an admin of the source group", async () => {
  const service = new FakeService();

  await buildListener(service, alwaysAdmin)(buildMessage({ text: "Palestra dia 20" }));

  assert.deepEqual(service.ingested, ["Palestra dia 20"]);
});

void test("ignores a message from someone who is not an admin", async () => {
  const service = new FakeService();

  await buildListener(service, neverAdmin)(buildMessage({ participant: student, text: "alguem sabe a nota?" }));

  assert.deepEqual(service.ingested, []);
});

void test("ignores messages from other groups", async () => {
  const service = new FakeService();

  await buildListener(service, alwaysAdmin)(buildMessage({ remoteJid: "120363000000000099@g.us", text: "oi" }));

  assert.deepEqual(service.ingested, []);
});

void test("ignores its own messages", async () => {
  const service = new FakeService();

  await buildListener(service, alwaysAdmin)(buildMessage({ fromMe: true, text: "eco" }));

  assert.deepEqual(service.ingested, []);
});

void test("reads the caption of a flyer", async () => {
  const service = new FakeService();

  await buildListener(service, alwaysAdmin)(buildMessage({ caption: "Semana academica, inscricoes abertas" }));

  assert.deepEqual(service.ingested, ["Semana academica, inscricoes abertas"]);
});

void test("ignores a message with no text at all", async () => {
  const service = new FakeService();

  await buildListener(service, alwaysAdmin)(buildMessage({ text: "" }));

  assert.deepEqual(service.ingested, []);
});

void test("stays silent when the admin list cannot be read", async () => {
  const service = new FakeService();
  const failing = async (): Promise<boolean> => Promise.reject(new Error("offline"));

  // Relaying everything on a metadata failure would be worse than relaying nothing.
  await assert.doesNotReject(() => buildListener(service, failing)(buildMessage({ text: "Palestra" })));
  assert.deepEqual(service.ingested, []);
});

void test("does nothing when no source group is configured", async () => {
  const service = new FakeService();
  const listener = createFacultyRelayListener({ sourceGroup: "", service, isGroupAdmin: alwaysAdmin });

  await listener(buildMessage({ text: "Palestra" }));

  assert.deepEqual(service.ingested, []);
});

void test("the admin checker caches the membership between messages", async () => {
  let calls = 0;
  const isAdmin = createAdminChecker(async () => {
    calls += 1;
    return Promise.resolve([admin]);
  });

  assert.equal(await isAdmin(sourceGroup, admin), true);
  assert.equal(await isAdmin(sourceGroup, student), false);

  assert.equal(calls, 1);
});

void test("the admin checker refetches once the cache expires", async () => {
  let calls = 0;
  let now = 0;
  const isAdmin = createAdminChecker(
    async () => {
      calls += 1;
      return Promise.resolve([admin]);
    },
    () => now
  );

  await isAdmin(sourceGroup, admin);
  now = 11 * 60 * 1000;
  await isAdmin(sourceGroup, admin);

  assert.equal(calls, 2);
});
