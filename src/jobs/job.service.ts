import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { env } from "../config/env.js";
import { formatJobMessage } from "./job.formatter.js";
import { JobRepository } from "./job.repository.js";
import type { NormalizedJob, PersistedJob } from "./job.types.js";
import { ArbeitnowProvider } from "./providers/arbeitnow.provider.js";
import { HimalayasProvider } from "./providers/himalayas.provider.js";
import { JobicyProvider } from "./providers/jobicy.provider.js";
import { RemoteokProvider } from "./providers/remoteok.provider.js";
import { RemotiveProvider } from "./providers/remotive.provider.js";
import type { JobProvider } from "./providers/provider.interface.js";

export type JobsPollResult = {
  fetched: number;
  discovered: number;
  queued: number;
  skippedDuplicates: number;
  providerFailures: number;
};

export type JobRepositoryLike = Pick<JobRepository, "countDiscoveredSince" | "createDelivery" | "findDuplicate" | "insert">;
export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};

export class JobService {
  constructor(
    private readonly providers: JobProvider[] = createDefaultProviders(),
    private readonly repository: JobRepositoryLike = new JobRepository(),
    private readonly queue: QueueServiceLike = queueService
  ) {}

  async poll(): Promise<JobsPollResult> {
    const discoveredToday = await this.repository.countDiscoveredSince(startOfToday());
    const dailyRemaining = env.JOBS_MAX_PER_DAY - discoveredToday;

    if (dailyRemaining <= 0) {
      logger.info({ maxPerDay: env.JOBS_MAX_PER_DAY, discoveredToday }, "Daily job limit reached, skipping poll");
      return { fetched: 0, discovered: 0, queued: 0, skippedDuplicates: 0, providerFailures: 0 };
    }

    const results = await Promise.allSettled(this.providers.map((provider) => provider.fetchJobs()));
    const fetchedJobs: NormalizedJob[] = [];
    let providerFailures = 0;

    for (const result of results) {
      if (result.status === "fulfilled") {
        fetchedJobs.push(...result.value);
      } else {
        providerFailures += 1;
        logger.error({ err: result.reason }, "Job provider failed");
      }
    }

    let discovered = 0;
    let queued = 0;
    let skippedDuplicates = 0;

    for (const job of fetchedJobs) {
      if (discovered >= dailyRemaining) {
        break;
      }

      const existing = await this.repository.findDuplicate(job);
      if (existing) {
        skippedDuplicates += 1;
        continue;
      }

      const persisted = await this.repository.insert(job);
      discovered += 1;
      queued += await this.enqueueJobToJobsGroups(persisted);
    }

    logger.info({ fetched: fetchedJobs.length, discovered, queued, skippedDuplicates, providerFailures }, "New jobs discovered");

    return {
      fetched: fetchedJobs.length,
      discovered,
      queued,
      skippedDuplicates,
      providerFailures
    };
  }

  private async enqueueJobToJobsGroups(job: PersistedJob): Promise<number> {
    const groups = getConfiguredWhatsAppGroups();
    const destinations = [groups.jobsGroup1, groups.jobsGroup2].filter((jid) => jid.length > 0);
    const message = formatJobMessage(job);
    let queued = 0;

    for (const destinationGroup of destinations) {
      const queuedMessage = await this.queue.enqueue({
        type: "job",
        destinationGroup,
        payload: {
          text: message
        }
      });

      const deliveryCreated = await this.repository.createDelivery({
        jobId: job.id,
        destinationGroup,
        queueMessageId: queuedMessage.id
      });

      if (deliveryCreated) {
        queued += 1;
      }
    }

    return queued;
  }
}

export const jobService = new JobService();

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function createDefaultProviders(): JobProvider[] {
  return [
    ...(env.JOBICY_JOBS_ENABLED ? [new JobicyProvider()] : []),
    ...(env.REMOTIVE_JOBS_ENABLED ? [new RemotiveProvider()] : []),
    ...(env.REMOTEOK_JOBS_ENABLED ? [new RemoteokProvider()] : []),
    ...(env.ARBEITNOW_JOBS_ENABLED ? [new ArbeitnowProvider()] : []),
    ...(env.HIMALAYAS_JOBS_ENABLED ? [new HimalayasProvider()] : [])
  ];
}
