import assert from "node:assert/strict";
import { test } from "node:test";
import { QueueWorker } from "./queue.worker.js";
import type { QueueMessage } from "./queue.types.js";

class FakeRepository {
  public message?: QueueMessage;
  public sent: string[] = [];
  public failed: string[] = [];
  public rescheduled: string[] = [];
  public recoveredBefore?: Date;

  async recoverStaleProcessing(staleBefore: Date): Promise<number> {
    await Promise.resolve();
    this.recoveredBefore = staleBefore;
    return 1;
  }

  async claimNext(_now?: Date, quietHoursActive = false): Promise<QueueMessage | undefined> {
    await Promise.resolve();
    const message = this.message;

    if (quietHoursActive && !message?.bypassQuietHours) {
      return undefined;
    }

    this.message = undefined;
    return message;
  }

  async markSent(id: string): Promise<void> {
    await Promise.resolve();
    this.sent.push(id);
  }

  async markFailed(id: string): Promise<void> {
    await Promise.resolve();
    this.failed.push(id);
  }

  async reschedulePending(id: string): Promise<void> {
    await Promise.resolve();
    this.rescheduled.push(id);
  }
}

const baseMessage: QueueMessage = {
  id: "7e65e34f-c668-4729-9078-4f8fb9f1f8cd",
  type: "manual",
  destinationGroup: "120363000000000000@g.us",
  payload: {
    text: "Teste"
  },
  status: "processing",
  priority: 0,
  bypassQuietHours: false,
  scheduledFor: new Date(),
  attempts: 1,
  createdAt: new Date(),
  sentAt: null,
  lastError: null,
  processingStartedAt: new Date()
};

void test("QueueWorker marks a delivered message as sent", async () => {
  const repository = new FakeRepository();
  repository.message = baseMessage;
  const sent: string[] = [];
  const worker = new QueueWorker(repository, {
    sender: async (_destination, text) => {
      await Promise.resolve();
      sent.push(text);
    },
    maxRetries: 3,
    now: () => new Date("2026-09-06T12:00:00")
  });

  const processed = await worker.processOne();

  assert.equal(processed, true);
  assert.deepEqual(sent, ["Teste"]);
  assert.deepEqual(repository.sent, [baseMessage.id]);
});

void test("QueueWorker reschedules failed messages while attempts remain", async () => {
  const repository = new FakeRepository();
  repository.message = { ...baseMessage, attempts: 2 };
  const worker = new QueueWorker(repository, {
    sender: async () => {
      await Promise.resolve();
      throw new Error("not connected");
    },
    maxRetries: 3,
    retryDelayMs: 10,
    now: () => new Date("2026-09-06T12:00:00")
  });

  await worker.processOne();

  assert.deepEqual(repository.rescheduled, [baseMessage.id]);
  assert.deepEqual(repository.failed, []);
});

void test("QueueWorker does not claim or send anything during quiet hours", async () => {
  const repository = new FakeRepository();
  repository.message = baseMessage;
  const sent: string[] = [];
  const worker = new QueueWorker(repository, {
    sender: async (_destination, text) => {
      await Promise.resolve();
      sent.push(text);
    },
    now: () => new Date("2026-09-06T03:00:00")
  });

  const processed = await worker.processOne();

  assert.equal(processed, false);
  assert.deepEqual(sent, []);
  assert.deepEqual(repository.sent, []);
  assert.equal(repository.message, baseMessage);
});

void test("QueueWorker still sends a bypassQuietHours message during quiet hours", async () => {
  const repository = new FakeRepository();
  repository.message = { ...baseMessage, bypassQuietHours: true };
  const sent: string[] = [];
  const worker = new QueueWorker(repository, {
    sender: async (_destination, text) => {
      await Promise.resolve();
      sent.push(text);
    },
    now: () => new Date("2026-09-06T03:00:00")
  });

  const processed = await worker.processOne();

  assert.equal(processed, true);
  assert.deepEqual(sent, ["Teste"]);
  assert.deepEqual(repository.sent, [baseMessage.id]);
});

void test("QueueWorker dispatches an eventCreation payload to the event sender", async () => {
  const repository = new FakeRepository();
  repository.message = {
    ...baseMessage,
    payload: { eventCreation: { name: "Gophercon", description: "desc", startDateIso: "2026-09-10T20:00:00.000Z" } }
  };
  const calls: Array<{ name: string; description?: string; startDateIso: string; endDateIso?: string }> = [];
  const worker = new QueueWorker(repository, {
    eventSender: async (_destination, name, description, startDateIso, endDateIso) => {
      await Promise.resolve();
      calls.push({ name, description, startDateIso, endDateIso });
    },
    now: () => new Date("2026-09-06T12:00:00")
  });

  const processed = await worker.processOne();

  assert.equal(processed, true);
  assert.deepEqual(calls, [{ name: "Gophercon", description: "desc", startDateIso: "2026-09-10T20:00:00.000Z", endDateIso: undefined }]);
});

void test("QueueWorker marks message as failed when retry limit is reached", async () => {
  const repository = new FakeRepository();
  repository.message = { ...baseMessage, attempts: 3 };
  const worker = new QueueWorker(repository, {
    sender: async () => {
      await Promise.resolve();
      throw new Error("not connected");
    },
    maxRetries: 3,
    now: () => new Date("2026-09-06T12:00:00")
  });

  await worker.processOne();

  assert.deepEqual(repository.failed, [baseMessage.id]);
  assert.deepEqual(repository.rescheduled, []);
});
