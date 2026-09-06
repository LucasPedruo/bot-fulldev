import assert from "node:assert/strict";
import { test } from "node:test";
import { isBotMentioned } from "./mentions.js";

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
