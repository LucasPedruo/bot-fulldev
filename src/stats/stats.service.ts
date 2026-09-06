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
export type QueueRepositoryLike = Pick<QueueRepository, "countSentByTypeSince" | "countFailedSince">;

export class StatsService {
  constructor(
    private readonly jobRepository: JobRepositoryLike = new JobRepository(),
    private readonly queueRepository: QueueRepositoryLike = new QueueRepository()
  ) {}

  async computeDailyStats(since: Date): Promise<DailyStats> {
    const [jobsDiscovered, jobsSent, eventsSent, eventRemindersSent, networkingMessagesSent, failedMessages] = await Promise.all([
      this.jobRepository.countDiscoveredSince(since),
      this.queueRepository.countSentByTypeSince("job", since),
      this.queueRepository.countSentByTypeSince("event", since),
      this.queueRepository.countSentByTypeSince("event_reminder", since),
      this.queueRepository.countSentByTypeSince("networking", since),
      this.queueRepository.countFailedSince(since)
    ]);

    return {
      jobsDiscovered,
      jobsSent,
      // No events source exists yet (roadmap item deferred to last) - always 0 until that ships.
      eventsDiscovered: 0,
      eventsSent,
      eventRemindersSent,
      networkingMessagesSent,
      failedMessages
    };
  }
}

export const statsService = new StatsService();
