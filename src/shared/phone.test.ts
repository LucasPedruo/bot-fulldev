import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPhoneNumber, isLikelyRealPhoneNumber } from "./phone.js";

void test("extractPhoneNumber strips the domain and the device suffix", () => {
  assert.equal(extractPhoneNumber("5511999999999@s.whatsapp.net"), "5511999999999");
  assert.equal(extractPhoneNumber("5511999999999:12@s.whatsapp.net"), "5511999999999");
  assert.equal(extractPhoneNumber("5511999999999"), "5511999999999");
});

void test("extractPhoneNumber returns undefined for non-numeric identities", () => {
  assert.equal(extractPhoneNumber("123abc456@lid"), undefined);
  assert.equal(extractPhoneNumber("@s.whatsapp.net"), undefined);
});

void test("accepts real Brazilian mobile numbers", () => {
  assert.equal(isLikelyRealPhoneNumber("5511987654321@s.whatsapp.net"), true);
  assert.equal(isLikelyRealPhoneNumber("5521999998888@s.whatsapp.net"), true);
  // The device suffix must not break the check.
  assert.equal(isLikelyRealPhoneNumber("5548991234567:3@s.whatsapp.net"), true);
});

void test("accepts a Brazilian landline registered on WhatsApp", () => {
  assert.equal(isLikelyRealPhoneNumber("551133334444@s.whatsapp.net"), true);
});

void test("rejects Brazilian numbers with an unassigned area code", () => {
  // 20, 23 and 90 are not allocated DDDs.
  assert.equal(isLikelyRealPhoneNumber("5520987654321@s.whatsapp.net"), false);
  assert.equal(isLikelyRealPhoneNumber("5523987654321@s.whatsapp.net"), false);
  assert.equal(isLikelyRealPhoneNumber("5590987654321@s.whatsapp.net"), false);
});

void test("rejects Brazilian 9-digit numbers that do not start with 9", () => {
  assert.equal(isLikelyRealPhoneNumber("5511887654321@s.whatsapp.net"), false);
});

void test("rejects Brazilian numbers of the wrong length", () => {
  assert.equal(isLikelyRealPhoneNumber("55119876543@s.whatsapp.net"), false);
  assert.equal(isLikelyRealPhoneNumber("55119876543210@s.whatsapp.net"), false);
});

void test("rejects non-geographic ranges typical of automated accounts", () => {
  // Toll-free (800), satellite (870, 881, 882) and global networks (883) are never a personal line.
  assert.equal(isLikelyRealPhoneNumber("8001234567@s.whatsapp.net"), false);
  assert.equal(isLikelyRealPhoneNumber("870123456789@s.whatsapp.net"), false);
  assert.equal(isLikelyRealPhoneNumber("882123456789@s.whatsapp.net"), false);
  assert.equal(isLikelyRealPhoneNumber("883123456789@s.whatsapp.net"), false);
});

void test("rejects unassigned country calling codes", () => {
  assert.equal(isLikelyRealPhoneNumber("9991234567890@s.whatsapp.net"), false);
  assert.equal(isLikelyRealPhoneNumber("0111234567890@s.whatsapp.net"), false);
});

void test("rejects numbers outside the E.164 length bounds", () => {
  assert.equal(isLikelyRealPhoneNumber("5511@s.whatsapp.net"), false);
  assert.equal(isLikelyRealPhoneNumber("1234567890123456@s.whatsapp.net"), false);
});

void test("rejects a LID that could not be resolved to a phone number", () => {
  assert.equal(isLikelyRealPhoneNumber("192837465@lid"), false);
});

void test("accepts plausible international mobile numbers", () => {
  assert.equal(isLikelyRealPhoneNumber("14155552671@s.whatsapp.net"), true);
  assert.equal(isLikelyRealPhoneNumber("351912345678@s.whatsapp.net"), true);
  assert.equal(isLikelyRealPhoneNumber("447911123456@s.whatsapp.net"), true);
});
