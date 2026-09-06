import { and, asc, eq, lte, sql as drizzleSql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../database/client.js";
import { messageQueue } from "../database/schema.js";
import type { EnqueueMessageInput, MessagePayload, QueueMessage } from "./queue.types.js";

const textMessagePayloadSchema = z.object({
  text: z.string().min(1),
  mentions: z.array(z.string()).optional()
});

const pollMessagePayloadSchema = z.object({
  poll: z.object({
    name: z.string().min(1),
    values: z.array(z.string()).min(1),
    selectableCount: z.number().int().positive().optional()
  })
});

const messagePayloadSchema = z.union([textMessagePayloadSchema, pollMessagePayloadSchema]);

type MessageQueueRow = typeof messageQueue.$inferSelect;

export class QueueRepository {
  async enqueue(input: EnqueueMessageInput): Promise<QueueMessage> {
    const [message] = await db
      .insert(messageQueue)
      .values({
        type: input.type,
        destinationGroup: input.destinationGroup,
        payload: input.payload,
        priority: input.priority ?? 0,
        bypassQuietHours: input.bypassQuietHours ?? false,
        scheduledFor: input.scheduledFor ?? new Date()
      })
      .returning();

    return toQueueMessage(message);
  }

  async claimNext(now = new Date(), quietHoursActive = false): Promise<QueueMessage | undefined> {
    const eligible = quietHoursActive
      ? and(eq(messageQueue.status, "pending"), lte(messageQueue.scheduledFor, now), eq(messageQueue.bypassQuietHours, true))
      : and(eq(messageQueue.status, "pending"), lte(messageQueue.scheduledFor, now));

    const [message] = await db
      .update(messageQueue)
      .set({
        status: "processing",
        attempts: drizzleSql`${messageQueue.attempts} + 1`,
        processingStartedAt: now,
        lastError: null
      })
      .where(
        eq(
          messageQueue.id,
          db
            .select({ id: messageQueue.id })
            .from(messageQueue)
            .where(eligible)
            .orderBy(asc(messageQueue.priority), asc(messageQueue.scheduledFor), asc(messageQueue.createdAt))
            .limit(1)
        )
      )
      .returning();

    return message ? toQueueMessage(message) : undefined;
  }

  async markSent(id: string, sentAt = new Date()): Promise<void> {
    await db
      .update(messageQueue)
      .set({
        status: "sent",
        sentAt,
        processingStartedAt: null,
        lastError: null
      })
      .where(eq(messageQueue.id, id));
  }

  async markFailed(id: string, error: string): Promise<void> {
    await db
      .update(messageQueue)
      .set({
        status: "failed",
        lastError: error,
        processingStartedAt: null
      })
      .where(eq(messageQueue.id, id));
  }

  async reschedulePending(id: string, scheduledFor: Date, error: string): Promise<void> {
    await db
      .update(messageQueue)
      .set({
        status: "pending",
        scheduledFor,
        lastError: error,
        processingStartedAt: null
      })
      .where(eq(messageQueue.id, id));
  }

  async recoverStaleProcessing(staleBefore: Date): Promise<number> {
    const recovered = await db
      .update(messageQueue)
      .set({
        status: "pending",
        processingStartedAt: null,
        lastError: "Recovered stale processing message"
      })
      .where(and(eq(messageQueue.status, "processing"), lte(messageQueue.processingStartedAt, staleBefore)))
      .returning({ id: messageQueue.id });

    return recovered.length;
  }
}

function toQueueMessage(row: MessageQueueRow): QueueMessage {
  return {
    ...row,
    payload: messagePayloadSchema.parse(row.payload) satisfies MessagePayload
  };
}
