import assert from "node:assert/strict";
import { test } from "node:test";
import type { EnqueueMessageInput, QueueMessage, TextMessagePayload } from "../queue/queue.types.js";
import { ReleaseAnnouncerService, type QueueServiceLike } from "./release-announcer.service.js";
import type { ReleaseNote } from "./release-notes.js";

const groups = ["120363000000000001@g.us", "120363000000000002@g.us"];

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
  constructor(public version?: string) {}

  async getLastAnnouncedVersion(): Promise<string | undefined> {
    await Promise.resolve();
    return this.version;
  }

  async setLastAnnouncedVersion(version: string): Promise<void> {
    await Promise.resolve();
    this.version = version;
  }
}

const note: ReleaseNote = {
  version: "0.2.0",
  sections: [{ title: "Adicionado", changes: ["Uma coisa nova.", "Outra coisa."] }]
};

function buildService(repository: FakeRepository, queue: FakeQueue, overrides = {}): ReleaseAnnouncerService {
  return new ReleaseAnnouncerService({
    groups,
    queue,
    repository,
    getVersion: async () => Promise.resolve("0.2.0"),
    getReleaseNote: async () => Promise.resolve(note),
    ...overrides
  });
}

void test("announces a new version to every configured group", async () => {
  const repository = new FakeRepository("0.1.0");
  const queue = new FakeQueue();

  const result = await buildService(repository, queue).announceIfNeeded();

  assert.equal(result.announced, true);
  assert.equal(result.version, "0.2.0");
  assert.equal(queue.enqueued.length, 2);
  assert.deepEqual(
    queue.enqueued.map((message) => message.destinationGroup),
    groups
  );
  const payload = queue.enqueued[0].payload as TextMessagePayload;
  assert.match(payload.text, /0\.2\.0/);
  assert.ok(payload.text.includes("Uma coisa nova."));
});

void test("records the version so a restart does not announce it twice", async () => {
  const repository = new FakeRepository("0.1.0");
  const queue = new FakeQueue();
  const service = buildService(repository, queue);

  await service.announceIfNeeded();
  const second = await service.announceIfNeeded();

  assert.equal(second.announced, false);
  assert.equal(second.reason, "already_announced");
  assert.equal(queue.enqueued.length, 2);
});

void test("says nothing on the very first boot of an already-known version", async () => {
  const repository = new FakeRepository("0.2.0");
  const queue = new FakeQueue();

  const result = await buildService(repository, queue).announceIfNeeded();

  assert.equal(result.announced, false);
  assert.equal(queue.enqueued.length, 0);
});

void test("a deploy at night still waits for the quiet-hours window", async () => {
  const repository = new FakeRepository("0.1.0");
  const queue = new FakeQueue();

  await buildService(repository, queue).announceIfNeeded();

  for (const message of queue.enqueued) {
    assert.notEqual(message.bypassQuietHours, true);
  }
});

void test("a version with no changelog entry is recorded but not announced", async () => {
  const repository = new FakeRepository("0.1.0");
  const queue = new FakeQueue();

  const result = await buildService(repository, queue, {
    getReleaseNote: async () => Promise.resolve(undefined)
  }).announceIfNeeded();

  assert.equal(result.announced, false);
  assert.equal(result.reason, "no_changelog_entry");
  assert.equal(queue.enqueued.length, 0);
  // Recorded anyway, so the next real entry cannot end up announced twice.
  assert.equal(repository.version, "0.2.0");
});

void test("does nothing when no group is configured", async () => {
  const repository = new FakeRepository("0.1.0");
  const queue = new FakeQueue();

  const result = await buildService(repository, queue, { groups: [] }).announceIfNeeded();

  assert.equal(result.announced, false);
  assert.equal(result.reason, "no_groups");
  // Not recorded: the version still deserves an announcement once a group exists.
  assert.equal(repository.version, "0.1.0");
});
