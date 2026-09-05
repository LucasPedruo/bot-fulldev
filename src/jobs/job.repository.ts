import { and, eq, or } from "drizzle-orm";
import { db } from "../database/client.js";
import { jobDeliveries, jobs } from "../database/schema.js";
import type { NormalizedJob, PersistedJob } from "./job.types.js";

type JobRow = typeof jobs.$inferSelect;

export class JobRepository {
  async findDuplicate(job: NormalizedJob): Promise<PersistedJob | undefined> {
    const [row] = await db
      .select()
      .from(jobs)
      .where(or(and(eq(jobs.source, job.source), eq(jobs.externalId, job.externalId)), eq(jobs.fingerprint, job.fingerprint)))
      .limit(1);

    return row ? toPersistedJob(row) : undefined;
  }

  async insert(job: NormalizedJob): Promise<PersistedJob> {
    const [row] = await db
      .insert(jobs)
      .values({
        externalId: job.externalId,
        source: job.source,
        title: job.title,
        company: job.company,
        location: job.location,
        remote: job.remote,
        level: job.level,
        category: job.category,
        technologies: job.technologies,
        url: job.url,
        fingerprint: job.fingerprint,
        publishedAt: job.publishedAt,
        discoveredAt: job.discoveredAt
      })
      .returning();

    return toPersistedJob(row);
  }

  async createDelivery(input: { jobId: string; destinationGroup: string; queueMessageId: string }): Promise<boolean> {
    const [row] = await db
      .insert(jobDeliveries)
      .values(input)
      .onConflictDoNothing()
      .returning({ id: jobDeliveries.id });

    return Boolean(row);
  }
}

function toPersistedJob(row: JobRow): PersistedJob {
  return {
    id: row.id,
    externalId: row.externalId,
    source: row.source,
    title: row.title,
    company: row.company,
    location: row.location ?? undefined,
    remote: row.remote,
    level: row.level ?? undefined,
    category: row.category,
    technologies: row.technologies,
    url: row.url,
    fingerprint: row.fingerprint,
    publishedAt: row.publishedAt ?? undefined,
    discoveredAt: row.discoveredAt
  };
}
