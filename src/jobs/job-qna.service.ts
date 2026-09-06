import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { parseJobQuery } from "./job-query.js";
import { formatJobQueryReply } from "./job.formatter.js";
import { JobRepository } from "./job.repository.js";

export type JobRepositoryLike = Pick<JobRepository, "query">;
export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};

export class JobQnaService {
  constructor(
    private readonly repository: JobRepositoryLike = new JobRepository(),
    private readonly queue: QueueServiceLike = queueService
  ) {}

  // Callers only invoke this once the bot has already been @-mentioned in a Jobs group
  // (see job-qna-listener.ts), so every call here gets answered.
  async handleMessage(groupJid: string, text: string): Promise<void> {
    const query = parseJobQuery(text);
    const jobs = await this.repository.query({ level: query.level, category: query.category });
    const reply = formatJobQueryReply(jobs, query);

    await this.queue.enqueue({ type: "job", destinationGroup: groupJid, payload: { text: reply } });
    logger.info({ groupJid, query, matches: jobs.length }, "Job query answered");
  }
}

export const jobQnaService = new JobQnaService();
