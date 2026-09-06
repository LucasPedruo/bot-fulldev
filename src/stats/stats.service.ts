import { EventRepository } from "../events/event.repository.js";
import { JobRepository } from "../jobs/job.repository.js";
import { QueueRepository } from "../queue/queue.repository.js";

export type DailyStats = {
  jobsDiscovered: number;
  jobsSent: number;
  eventsDiscovered: number;
  eventsSent: number;
  eventRemindersSent: number;
  networkingMessagesSent: number;
  failedMessages: number;
};

export type JobRepositoryLike = Pick<JobRepository, "countDiscoveredSince">;
export type EventRepositoryLike = Pick<EventRepository, "countDiscoveredSince">;
export type QueueRepositoryLike = Pick<QueueRepository, "countSentByTypeSince" | "countFailedSince">;

export class StatsService {
  constructor(
    private readonly jobRepository: JobRepositoryLike = new JobRepository(),
    private readonly eventRepository: EventRepositoryLike = new EventRepository(),
    private readonly queueRepository: QueueRepositoryLike = new QueueRepository()
  ) {}

  async computeDailyStats(since: Date): Promise<DailyStats> {
    const [jobsDiscovered, eventsDiscovered, jobsSent, eventsSent, eventRemindersSent, networkingMessagesSent, failedMessages] =
      await Promise.all([
        this.jobRepository.countDiscoveredSince(since),
        this.eventRepository.countDiscoveredSince(since),
        this.queueRepository.countSentByTypeSince("job", since),
        this.queueRepository.countSentByTypeSince("event", since),
        this.queueRepository.countSentByTypeSince("event_reminder", since),
        this.queueRepository.countSentByTypeSince("networking", since),
        this.queueRepository.countFailedSince(since)
      ]);

    return {
      jobsDiscovered,
      jobsSent,
      eventsDiscovered,
      eventsSent,
      eventRemindersSent,
      networkingMessagesSent,
      failedMessages
    };
  }
}

export const statsService = new StatsService();
