import assert from "node:assert/strict";
import { test } from "node:test";
import type { EnqueueMessageInput, QueueMessage, TextMessagePayload } from "../queue/queue.types.js";
import {
  createGroupIntroductionListener,
  type GroupParticipantsUpdate,
  type QueueServiceLike
} from "./group-introduction-listener.js";
import type { GroupRole } from "./group-introduction.js";

const botPhoneJid = "5531985688535@s.whatsapp.net";
const botLid = "192837465@lid";
const communityGroup = "120363000000000001@g.us";
const outsideGroup = "120363000000000077@g.us";

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

class FakeRepository {
  constructor(public groups: string[] = []) {}

  async getIntroducedGroups(): Promise<string[]> {
    await Promise.resolve();
    return this.groups;
  }

  async markIntroduced(groupJid: string): Promise<void> {
    await Promise.resolve();
    if (!this.groups.includes(groupJid)) {
      this.groups.push(groupJid);
    }
  }
}

function buildUpdate(overrides: Partial<GroupParticipantsUpdate> = {}): GroupParticipantsUpdate {
  return {
    id: communityGroup,
    author: "5511999999999@s.whatsapp.net",
    participants: [{ id: botPhoneJid }],
    action: "add",
    ...overrides
  };
}

function buildListener(queue: FakeQueue, repository: FakeRepository, botJids: string[] = [botPhoneJid, botLid]) {
  return createGroupIntroductionListener({
    getBotJids: () => botJids,
    queue,
    repository,
    resolveRole: (groupJid: string): GroupRole => (groupJid === communityGroup ? "community" : "external")
  });
}

void test("greets a community group without pitching the community back at it", async () => {
  const queue = new FakeQueue();

  await buildListener(queue, new FakeRepository())(buildUpdate());

  assert.equal(queue.enqueued.length, 1);
  const text = (queue.enqueued[0].payload as TextMessagePayload).text;
  assert.match(text, /Quackson/);
  assert.match(text, /sentinela/i);
  // The long "what FullDev is" paragraph belongs only in outside groups.
  assert.ok(!text.includes("grupo independente de desenvolvedores"));
});

void test("introduces both itself and the community in an outside group", async () => {
  const queue = new FakeQueue();

  await buildListener(queue, new FakeRepository())(buildUpdate({ id: outsideGroup }));

  const text = (queue.enqueued[0].payload as TextMessagePayload).text;
  assert.match(text, /Quackson/);
  assert.ok(text.includes("grupo independente de desenvolvedores"));
});

void test("recognizes itself by its LID when the group is LID-addressed", async () => {
  const queue = new FakeQueue();

  await buildListener(queue, new FakeRepository())(buildUpdate({ participants: [{ id: botLid }] }));

  assert.equal(queue.enqueued.length, 1);
});

void test("stays quiet when somebody else is added", async () => {
  const queue = new FakeQueue();

  await buildListener(queue, new FakeRepository())(buildUpdate({ participants: [{ id: "5511977776666@s.whatsapp.net" }] }));

  assert.deepEqual(queue.enqueued, []);
});

void test("does not greet a group that was already introduced", async () => {
  const queue = new FakeQueue();
  // Survives a restart, unlike the in-memory set this replaced.
  const repository = new FakeRepository([communityGroup]);

  await buildListener(queue, repository)(buildUpdate());

  assert.deepEqual(queue.enqueued, []);
});

void test("records the group so a replayed event does not greet twice", async () => {
  const queue = new FakeQueue();
  const repository = new FakeRepository();
  const listener = buildListener(queue, repository);

  await listener(buildUpdate());
  await listener(buildUpdate());

  assert.equal(queue.enqueued.length, 1);
  assert.deepEqual(repository.groups, [communityGroup]);
});

void test("ignores actions other than add", async () => {
  const queue = new FakeQueue();
  const listener = buildListener(queue, new FakeRepository());

  await listener(buildUpdate({ action: "remove" }));
  await listener(buildUpdate({ action: "promote" }));

  assert.deepEqual(queue.enqueued, []);
});

void test("does nothing while the bot's own identity is unknown", async () => {
  const queue = new FakeQueue();

  await buildListener(queue, new FakeRepository(), [])(buildUpdate());

  assert.deepEqual(queue.enqueued, []);
});

void test("the greeting arrives right away rather than waiting out quiet hours", async () => {
  const queue = new FakeQueue();

  await buildListener(queue, new FakeRepository())(buildUpdate());

  assert.equal(queue.enqueued[0].bypassQuietHours, true);
});

void test("a repository failure never rejects the socket handler", async () => {
  const queue = new FakeQueue();
  const failing = {
    getIntroducedGroups: async (): Promise<string[]> => Promise.reject(new Error("db down")),
    markIntroduced: async (): Promise<void> => Promise.resolve()
  };
  const listener = createGroupIntroductionListener({
    getBotJids: () => [botPhoneJid],
    queue,
    repository: failing
  });

  await assert.doesNotReject(() => listener(buildUpdate()));
  assert.deepEqual(queue.enqueued, []);
});
