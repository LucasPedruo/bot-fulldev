import assert from "node:assert/strict";
import { test } from "node:test";
import { getAutoApproveGroups, type AutoApproveDiscoverySocket } from "./join-request.service.js";
import { createJoinRequestListener } from "./join-request-listener.js";

void test("discovers unconfigured admin groups using both phone and LID identities", async () => {
  const groups = await getAutoApproveGroups({
    user: { id: "5511987654321:12@s.whatsapp.net", lid: "12345:3@lid" },
    groupFetchAllParticipating: async () => {
      await Promise.resolve();
      return ({
      first: { id: "new-group@g.us", participants: [{ id: "5511987654321@s.whatsapp.net", admin: "admin" }] },
      second: { id: "lid-group@g.us", participants: [{ id: "12345@lid", admin: "superadmin" }] },
      third: { id: "phone-group@g.us", participants: [{ id: "other@lid", phoneNumber: "5511987654321@s.whatsapp.net", admin: "admin" }] },
      member: { id: "member@g.us", participants: [{ id: "12345@lid", admin: null }] },
      otherAdmin: { id: "other-admin@g.us", participants: [{ id: "67890@lid", admin: "admin" }] },
      duplicate: { id: "new-group@g.us", participants: [{ id: "12345@lid", admin: "admin" }] }
    });
    }
  });
  assert.deepEqual(groups, ["new-group@g.us", "lid-group@g.us", "phone-group@g.us"]);
});

void test("does not discover groups before the bot identity is available", async () => {
  let fetched = false;
  const socket: AutoApproveDiscoverySocket = {
    groupFetchAllParticipating: async () => { await Promise.resolve(); fetched = true; return {}; }
  };
  assert.deepEqual(await getAutoApproveGroups(socket), []);
  assert.equal(fetched, false);
});

void test("surfaces discovery failures so a later scheduled sweep can retry", async () => {
  await assert.rejects(() => getAutoApproveGroups({
    user: { id: "12345@lid" },
    groupFetchAllParticipating: async () => { await Promise.resolve(); throw new Error("connection lost"); }
  }), /connection lost/);
});

void test("processes new requests outside the old networking allowlist by default", async () => {
  const processed: string[] = [];
  const listener = createJoinRequestListener({ service: {
    processGroup: async (groupJid) => {
      await Promise.resolve();
      processed.push(groupJid);
      return { groupJid, pending: 0, approved: [], skippedSuspicious: [], skippedBlocked: [], skippedNoCapacity: [] };
    }
  } });
  await listener({ id: "new-group@g.us", author: "12345@lid", participant: "67890@lid", action: "created", method: "invite_link" });
  assert.deepEqual(processed, ["new-group@g.us"]);
});
