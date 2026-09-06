import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import { db } from "../database/client.js";
import { jobDeliveries, jobs } from "../database/schema.js";
import type { JobCategory, JobLevel, NormalizedJob, PersistedJob } from "./job.types.js";

type JobRow = typeof jobs.$inferSelect;

export type JobQueryFilter = {
  level?: JobLevel;
  category?: JobCategory;
  limit?: number;
};

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

  async countDiscoveredSince(since: Date): Promise<number> {
    const [row] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(jobs)
      .where(gte(jobs.discoveredAt, since));

    return row?.value ?? 0;
  }

  async createDelivery(input: { jobId: string; destinationGroup: string; queueMessageId: string }): Promise<boolean> {
    const [row] = await db
      .insert(jobDeliveries)
      .values(input)
      .onConflictDoNothing()
      .returning({ id: jobDeliveries.id });

    return Boolean(row);
  }

  // Backs the jobs Q&A feature: answers "vagas de junior frontend?" against what's actually stored.
  async query(filter: JobQueryFilter): Promise<PersistedJob[]> {
    const conditions = [];

    if (filter.level) {
      conditions.push(eq(jobs.level, filter.level));
    }

    if (filter.category) {
      conditions.push(eq(jobs.category, filter.category));
    }

    const rows = await db
      .select()
      .from(jobs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(jobs.discoveredAt))
      .limit(filter.limit ?? 5);

    return rows.map(toPersistedJob);
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
