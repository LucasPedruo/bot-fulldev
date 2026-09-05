import { logger } from "../shared/logger.js";
import { QueueRepository } from "./queue.repository.js";
import type { EnqueueMessageInput, QueueMessage } from "./queue.types.js";

export class QueueService {
  constructor(private readonly repository = new QueueRepository()) {}

  async enqueue(input: EnqueueMessageInput): Promise<QueueMessage> {
    const message = await this.repository.enqueue(input);
    logger.info({ messageId: message.id, type: message.type, destinationGroup: message.destinationGroup }, "Message queued");
    return message;
  }
}

export const queueService = new QueueService();
