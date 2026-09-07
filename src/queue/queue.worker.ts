import { env } from "../config/env.js";
import { isQuietHours } from "../shared/quiet-hours.js";
import { logger } from "../shared/logger.js";
import { sendEventMessage, sendPollMessage, sendTextMessage } from "../whatsapp/sender.js";
import { QueueRepository } from "./queue.repository.js";
import type { QueueMessage } from "./queue.types.js";

export type QueueWorkerStatus = "not_started" | "ready" | "stopped";
export type QueueRepositoryLike = Pick<
  QueueRepository,
  "claimNext" | "markFailed" | "markSent" | "recoverStaleProcessing" | "reschedulePending"
>;

export type QueueTextSender = (destinationGroup: string, text: string, mentions: string[]) => Promise<void>;
export type QueuePollSender = (
  destinationGroup: string,
  name: string,
  values: string[],
  selectableCount?: number
) => Promise<void>;
export type QueueEventSender = (
  destinationGroup: string,
  name: string,
  description: string | undefined,
  startDateIso: string,
  endDateIso?: string
) => Promise<void>;

export type QueueWorkerOptions = {
  intervalMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  staleProcessingMs?: number;
  sender?: QueueTextSender;
  pollSender?: QueuePollSender;
  eventSender?: QueueEventSender;
  now?: () => Date;
};

export class QueueWorker {
  private status: QueueWorkerStatus = "not_started";
  private running = false;
  private timer?: NodeJS.Timeout;
  private readonly intervalMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly staleProcessingMs: number;
  private readonly sender: QueueTextSender;
  private readonly pollSender: QueuePollSender;
  private readonly eventSender: QueueEventSender;
  private readonly now: () => Date;

  constructor(
    private readonly repository: QueueRepositoryLike = new QueueRepository(),
    options: QueueWorkerOptions = {}
  ) {
    this.intervalMs = options.intervalMs ?? env.MESSAGE_INTERVAL_SECONDS * 1_000;
    this.maxRetries = options.maxRetries ?? env.MESSAGE_MAX_RETRIES;
    this.retryDelayMs = options.retryDelayMs ?? this.intervalMs;
    this.staleProcessingMs = options.staleProcessingMs ?? Math.max(this.intervalMs * 3, 5 * 60_000);
    this.sender = options.sender ?? sendTextMessage;
    this.pollSender = options.pollSender ?? sendPollMessage;
    this.eventSender = options.eventSender ?? sendEventMessage;
    this.now = options.now ?? (() => new Date());
  }

  getStatus(): QueueWorkerStatus {
    return this.status;
  }

  async start(): Promise<void> {
    if (this.status === "ready") {
      return;
    }

    const recovered = await this.repository.recoverStaleProcessing(new Date(Date.now() - this.staleProcessingMs));
    if (recovered > 0) {
      logger.warn({ recovered }, "Recovered stale processing messages");
    }

    this.status = "ready";
    this.scheduleNext(0);
    logger.info({ intervalMs: this.intervalMs, maxRetries: this.maxRetries }, "Queue worker started");
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    this.status = "stopped";
    logger.info("Queue worker stopped");
  }

  async processOne(): Promise<boolean> {
    if (this.running) {
      return false;
    }

    this.running = true;

    try {
      const message = await this.repository.claimNext(this.now(), isQuietHours(this.now()));
      if (!message) {
        return false;
      }

      await this.deliver(message);
      return true;
    } finally {
      this.running = false;
    }
  }

  private scheduleNext(delayMs: number): void {
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (this.status !== "ready") {
      return;
    }

    try {
      await this.processOne();
    } catch (error) {
      logger.error({ err: error }, "Queue worker tick failed");
    } finally {
      if (this.status === "ready") {
        this.scheduleNext(this.intervalMs);
      }
    }
  }

  private async deliver(message: QueueMessage): Promise<void> {
    try {
      if ("poll" in message.payload) {
        const { name, values, selectableCount } = message.payload.poll;
        await this.pollSender(message.destinationGroup, name, values, selectableCount);
      } else if ("eventCreation" in message.payload) {
        const { name, description, startDateIso, endDateIso } = message.payload.eventCreation;
        await this.eventSender(message.destinationGroup, name, description, startDateIso, endDateIso);
      } else {
        await this.sender(message.destinationGroup, message.payload.text, message.payload.mentions ?? []);
      }

      await this.repository.markSent(message.id);
      logger.info({ messageId: message.id, destinationGroup: message.destinationGroup }, "Message sent");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (message.attempts >= this.maxRetries) {
        await this.repository.markFailed(message.id, errorMessage);
        logger.error({ messageId: message.id, err: error }, "Message failed");
        return;
      }

      const scheduledFor = new Date(Date.now() + this.retryDelayMs);
      await this.repository.reschedulePending(message.id, scheduledFor, errorMessage);
      logger.warn({ messageId: message.id, scheduledFor }, "Retry scheduled");
    }
  }
}

export const queueWorker = new QueueWorker();
