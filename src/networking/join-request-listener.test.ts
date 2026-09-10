import assert from "node:assert/strict";
import { test } from "node:test";
import { createJoinRequestListener, type GroupJoinRequestUpdate } from "./join-request-listener.js";
import type { ProcessGroupResult } from "./join-request.service.js";

const networkingGroups = ["120363000000000001@g.us", "120363000000000002@g.us"];

class FakeService {
  public processed: string[] = [];
  public shouldThrow = false;

  async processGroup(groupJid: string): Promise<ProcessGroupResult> {
    await Promise.resolve();

    if (this.shouldThrow) {
      throw new Error("boom");
    }

    this.processed.push(groupJid);
    return {
      groupJid,
      pending: 0,
      approved: [],
      skippedSuspicious: [],
      skippedNoCapacity: [],
      waitlistNoticeSent: false
    };
  }
}

function buildUpdate(overrides: Partial<GroupJoinRequestUpdate> = {}): GroupJoinRequestUpdate {
  return {
    id: networkingGroups[0],
    author: "5511987654321@s.whatsapp.net",
    participant: "5521999998888@s.whatsapp.net",
    action: "created",
    method: "invite_link",
    ...overrides
  };
}

void test("sweeps the group when a request is created", async () => {
  const service = new FakeService();
  const listener = createJoinRequestListener({ networkingGroups, service });

  await listener(buildUpdate());

  assert.deepEqual(service.processed, [networkingGroups[0]]);
});

void test("ignores groups that are not configured as networking groups", async () => {
  const service = new FakeService();
  const listener = createJoinRequestListener({ networkingGroups, service });

  await listener(buildUpdate({ id: "120363000000000099@g.us" }));

  assert.deepEqual(service.processed, []);
});

void test("ignores non-created actions", async () => {
  const service = new FakeService();
  const listener = createJoinRequestListener({ networkingGroups, service });

  await listener(buildUpdate({ action: "revoked" }));
  await listener(buildUpdate({ action: "rejected" }));

  assert.deepEqual(service.processed, []);
});

void test("swallows service failures so the socket handler never rejects", async () => {
  const service = new FakeService();
  service.shouldThrow = true;
  const listener = createJoinRequestListener({ networkingGroups, service });

  await assert.doesNotReject(() => listener(buildUpdate()));
});
