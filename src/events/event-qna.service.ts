import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { parseEventQuery } from "./event-query.js";
import { formatEventQueryReply } from "./event.formatter.js";
import { EventRepository } from "./event.repository.js";

export type EventRepositoryLike = Pick<EventRepository, "query">;
export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};

export class EventQnaService {
  constructor(
    private readonly repository: EventRepositoryLike = new EventRepository(),
    private readonly queue: QueueServiceLike = queueService,
    private readonly now: () => Date = () => new Date()
  ) {}

  // Returns whether the message was actually treated as an event question - callers don't need it,
  // it just makes intent explicit and keeps the method easy to test.
  async handleMessage(groupJid: string, text: string): Promise<boolean> {
    const query = parseEventQuery(text, this.now());
    if (!query) {
      return false;
    }

    const events = await this.repository.query({ month: query.month, year: query.year, locationContains: query.location });
    const reply = formatEventQueryReply(events, query);

    await this.queue.enqueue({ type: "event", destinationGroup: groupJid, payload: { text: reply } });
    logger.info({ groupJid, query, matches: events.length }, "Event query answered");
    return true;
  }
}

export const eventQnaService = new EventQnaService();
