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

  // Callers only invoke this once the bot has already been @-mentioned in the Events group
  // (see event-qna-listener.ts), so every call here gets answered - there's no separate
  // "was this actually a question" check.
  async handleMessage(groupJid: string, text: string): Promise<void> {
    const query = parseEventQuery(text, this.now());
    const events = await this.repository.query({ month: query.month, year: query.year, locationContains: query.location });
    const reply = formatEventQueryReply(events, query);

    await this.queue.enqueue({ type: "event", destinationGroup: groupJid, payload: { text: reply } });
    logger.info({ groupJid, query, matches: events.length }, "Event query answered");
  }
}

export const eventQnaService = new EventQnaService();
