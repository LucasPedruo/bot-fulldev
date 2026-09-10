import assert from "node:assert/strict";
import { test } from "node:test";
import type { WAMessage } from "@whiskeysockets/baileys";
import { downloadMedia, isUnresolvableHostError } from "./media.js";

const message = { key: { remoteJid: "120363000000000001@g.us", id: "MSG1" } } as WAMessage;

void test("recognizes an unresolvable host, including when undici wraps it", () => {
  assert.equal(isUnresolvableHostError({ code: "ENOTFOUND" }), true);
  // undici puts the DNS code on the cause, not on the error it throws.
  assert.equal(isUnresolvableHostError(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } })), true);
  assert.equal(isUnresolvableHostError({ code: "ECONNRESET" }), false);
  assert.equal(isUnresolvableHostError(new Error("boom")), false);
  assert.equal(isUnresolvableHostError(null), false);
});

void test("uses whatever host the message carries when it works", async () => {
  const hosts: Array<string | undefined> = [];

  const data = await downloadMedia(message, async (_m, host) => {
    hosts.push(host);
    return Promise.resolve(Buffer.from("ok"));
  });

  assert.equal(data.toString(), "ok");
  assert.deepEqual(hosts, [undefined]);
});

void test("retries on the current host when the proto points at a retired one", async () => {
  const hosts: Array<string | undefined> = [];

  // Production case: messages still carrying a.whatsapp.net, which no longer resolves.
  const data = await downloadMedia(message, async (_m, host) => {
    hosts.push(host);

    if (!host) {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    }

    return Promise.resolve(Buffer.from("recuperado"));
  });

  assert.equal(data.toString(), "recuperado");
  assert.deepEqual(hosts, [undefined, "mmg.whatsapp.net"]);
});

void test("does not retry a failure that is not a DNS problem", async () => {
  let calls = 0;

  await assert.rejects(() =>
    downloadMedia(message, async () => {
      calls += 1;
      return Promise.reject(Object.assign(new Error("gone"), { code: "ECONNRESET" }));
    })
  );

  assert.equal(calls, 1);
});

void test("propagates the failure when the retry also fails", async () => {
  await assert.rejects(() =>
    downloadMedia(message, async () => Promise.reject(Object.assign(new Error("nope"), { code: "ENOTFOUND" })))
  );
});
