import type { WASocket } from "@whiskeysockets/baileys";
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMentionTag, isBotMentioned, resolvePhoneJid, resolvePhoneJids } from "./mentions.js";

function fakeSocket(getPNForLID: (lid: string) => Promise<string | null>): WASocket {
  return { signalRepository: { lidMapping: { getPNForLID } } } as unknown as WASocket;
}

async function resolved<T>(value: T): Promise<T> {
  await Promise.resolve();
  return value;
}

const botJids = ["551100000000:1@s.whatsapp.net", "999888777:1@lid"];

void test("isBotMentioned matches the bot's phone-number JID", () => {
  assert.equal(isBotMentioned(["551100000000@s.whatsapp.net"], botJids), true);
});

void test("isBotMentioned matches the bot's LID", () => {
  assert.equal(isBotMentioned(["999888777@lid"], botJids), true);
});

void test("isBotMentioned returns false when no one relevant is mentioned", () => {
  assert.equal(isBotMentioned(["5521999999999@s.whatsapp.net"], botJids), false);
});

void test("isBotMentioned returns false with no mentions or no bot JIDs", () => {
  assert.equal(isBotMentioned(undefined, botJids), false);
  assert.equal(isBotMentioned([], botJids), false);
  assert.equal(isBotMentioned(["551100000000@s.whatsapp.net"], []), false);
});

void test("resolvePhoneJid returns non-LID JIDs unchanged without calling the mapping", async () => {
  const socket = fakeSocket(() => {
    throw new Error("should not be called for a non-LID jid");
  });

  const result = await resolvePhoneJid("5511999999999@s.whatsapp.net", socket);

  assert.equal(result, "5511999999999@s.whatsapp.net");
});

void test("resolvePhoneJid resolves a LID to its mapped phone-number JID", async () => {
  const socket = fakeSocket((lid) => {
    assert.equal(lid, "162783622594588@lid");
    return resolved("5511999999999@s.whatsapp.net");
  });

  const result = await resolvePhoneJid("162783622594588@lid", socket);

  assert.equal(result, "5511999999999@s.whatsapp.net");
});

void test("resolvePhoneJid falls back to the original LID when no mapping is known", async () => {
  const socket = fakeSocket(() => resolved(null));

  const result = await resolvePhoneJid("162783622594588@lid", socket);

  assert.equal(result, "162783622594588@lid");
});

void test("resolvePhoneJid falls back to the original LID when the lookup throws", async () => {
  const socket = fakeSocket(() => {
    throw new Error("network hiccup");
  });

  const result = await resolvePhoneJid("162783622594588@lid", socket);

  assert.equal(result, "162783622594588@lid");
});

void test("resolvePhoneJids resolves a mixed list of LID and phone-number JIDs", async () => {
  const socket = fakeSocket((lid) => resolved(lid === "162783622594588@lid" ? "5511999999999@s.whatsapp.net" : null));

  const result = await resolvePhoneJids(["162783622594588@lid", "5521988888888@s.whatsapp.net"], socket);

  assert.deepEqual(result, ["5511999999999@s.whatsapp.net", "5521988888888@s.whatsapp.net"]);
});

void test("buildMentionTag strips the device suffix from a resolved phone-number JID", () => {
  assert.equal(buildMentionTag("5511993099643:0@s.whatsapp.net"), "@5511993099643");
});

void test("buildMentionTag works on a JID with no device suffix", () => {
  assert.equal(buildMentionTag("5511993099643@s.whatsapp.net"), "@5511993099643");
});
