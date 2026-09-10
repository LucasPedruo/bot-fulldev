import assert from "node:assert/strict";
import { test } from "node:test";
import type { EnqueueMessageInput, QueueMessage, TextMessagePayload } from "../queue/queue.types.js";
import { FacultyRelayService, type QueueServiceLike, type TimerHandle } from "./faculty-relay.service.js";

const destinationGroup = "120363000000000009@g.us";

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

// Stands in for setTimeout so the debounce window can be closed on demand.
class FakeClock {
  private pending?: () => void;
  public scheduleCount = 0;
  public cancelCount = 0;

  readonly schedule = (run: () => void): TimerHandle => {
    this.scheduleCount += 1;
    this.pending = run;
    return {
      cancel: () => {
        this.cancelCount += 1;
        this.pending = undefined;
      }
    };
  };

  fire(): void {
    const run = this.pending;
    this.pending = undefined;
    run?.();
  }

  hasPending(): boolean {
    return this.pending !== undefined;
  }
}

function buildService(queue: FakeQueue, clock: FakeClock, overrides = {}): FacultyRelayService {
  return new FacultyRelayService({
    destinationGroup,
    debounceMinutes: 5,
    queue,
    schedule: clock.schedule,
    summarize: async (messages: string[]) => Promise.resolve(`resumo de ${messages.length}`),
    ...overrides
  });
}

void test("does not relay anything before the debounce window closes", async () => {
  const queue = new FakeQueue();
  const clock = new FakeClock();
  const service = buildService(queue, clock);

  service.ingest("Palestra na quinta");

  assert.equal(queue.enqueued.length, 0);
  assert.equal(service.pendingCount(), 1);
  await Promise.resolve();
});

void test("groups messages that arrive together into one relay", async () => {
  const queue = new FakeQueue();
  const clock = new FakeClock();
  const service = buildService(queue, clock);

  service.ingest("Palestra de IA");
  service.ingest("Dia 20/09 as 19h");
  service.ingest("Inscricoes no link X");
  await service.flush();

  assert.equal(queue.enqueued.length, 1);
  const payload = queue.enqueued[0].payload as TextMessagePayload;
  assert.match(payload.text, /resumo de 3/);
  assert.equal(queue.enqueued[0].destinationGroup, destinationGroup);
});

void test("each new message pushes the deadline out", () => {
  const queue = new FakeQueue();
  const clock = new FakeClock();
  const service = buildService(queue, clock);

  service.ingest("primeira");
  service.ingest("segunda");

  // Two schedules, and the first one was cancelled by the second message.
  assert.equal(clock.scheduleCount, 2);
  assert.equal(clock.cancelCount, 1);
});

void test("relays once the group goes quiet for the full window", async () => {
  const queue = new FakeQueue();
  const clock = new FakeClock();
  const service = buildService(queue, clock);

  service.ingest("Workshop de Docker");
  clock.fire();
  // The timer callback kicks off an async flush.
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(queue.enqueued.length, 1);
  assert.equal(service.pendingCount(), 0);
});

void test("empties the buffer so the next batch starts clean", async () => {
  const queue = new FakeQueue();
  const clock = new FakeClock();
  const service = buildService(queue, clock);

  service.ingest("primeiro aviso");
  await service.flush();
  service.ingest("segundo aviso");
  await service.flush();

  assert.equal(queue.enqueued.length, 2);
  assert.match((queue.enqueued[1].payload as TextMessagePayload).text, /resumo de 1/);
});

void test("flushing an empty buffer relays nothing", async () => {
  const queue = new FakeQueue();
  const clock = new FakeClock();

  await buildService(queue, clock).flush();

  assert.equal(queue.enqueued.length, 0);
});

void test("falls back to the raw messages when the summary fails", async () => {
  const queue = new FakeQueue();
  const clock = new FakeClock();
  const service = buildService(queue, clock, {
    summarize: async () => Promise.resolve(undefined)
  });

  service.ingest("Edital de monitoria aberto");
  service.ingest("Prazo ate 30/09");
  await service.flush();

  const payload = queue.enqueued[0].payload as TextMessagePayload;
  // Losing the announcement would be worse than relaying it unsummarized.
  assert.ok(payload.text.includes("Edital de monitoria aberto"));
  assert.ok(payload.text.includes("Prazo ate 30/09"));
});

void test("ignores blank messages", async () => {
  const queue = new FakeQueue();
  const clock = new FakeClock();
  const service = buildService(queue, clock);

  service.ingest("   ");
  service.ingest("\n\n");

  assert.equal(service.pendingCount(), 0);
  assert.equal(clock.hasPending(), false);
  await service.flush();
  assert.equal(queue.enqueued.length, 0);
});

void test("drops the batch when no destination group is configured", async () => {
  const queue = new FakeQueue();
  const clock = new FakeClock();
  const service = buildService(queue, clock, { destinationGroup: "" });

  service.ingest("Palestra");
  await service.flush();

  assert.equal(queue.enqueued.length, 0);
});

void test("the relayed message says where the announcement came from", async () => {
  const queue = new FakeQueue();
  const clock = new FakeClock();
  const service = buildService(queue, clock);

  service.ingest("Semana academica");
  await service.flush();

  const payload = queue.enqueued[0].payload as TextMessagePayload;
  assert.match(payload.text, /representantes de eixo/i);
});

void test("an announcement arriving at night waits for the quiet-hours window", async () => {
  const queue = new FakeQueue();
  const clock = new FakeClock();
  const service = buildService(queue, clock);

  service.ingest("Aviso da madrugada");
  await service.flush();

  assert.notEqual(queue.enqueued[0].bypassQuietHours, true);
});

void test("concurrent flushes do not relay the same batch twice", async () => {
  const queue = new FakeQueue();
  const clock = new FakeClock();
  const service = buildService(queue, clock);

  service.ingest("Evento unico");
  await Promise.all([service.flush(), service.flush()]);

  assert.equal(queue.enqueued.length, 1);
});
