import { z } from "zod";
import { logger } from "../../shared/logger.js";
import { env } from "../../config/env.js";
import { createJobFingerprint, extractTechnologies, inferCategory, inferLevel, normalizeUrl } from "../job.normalizer.js";
import type { NormalizedJob } from "../job.types.js";
import type { JobProvider } from "./provider.interface.js";

const stringOrStringArraySchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .default("")
  .transform((value) => (Array.isArray(value) ? value.join(" ") : value));

const jobicyJobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  url: z.string().url(),
  jobTitle: z.string().min(1),
  companyName: z.string().min(1),
  jobIndustry: stringOrStringArraySchema,
  jobType: stringOrStringArraySchema,
  jobGeo: z.string().optional().default(""),
  jobLevel: z.string().optional().default(""),
  jobExcerpt: z.string().optional().default(""),
  jobDescription: z.string().optional().default(""),
  pubDate: z.string().optional()
});

const jobicyResponseSchema = z.object({
  jobs: z.array(jobicyJobSchema)
});

type JobicyJob = z.infer<typeof jobicyJobSchema>;

export class JobicyProvider implements JobProvider {
  public readonly name = "Jobicy";

  async fetchJobs(): Promise<NormalizedJob[]> {
    logger.info({ provider: this.name }, "Job provider started");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`https://jobicy.com/api/v2/remote-jobs?count=${env.JOBICY_JOBS_COUNT}&industry=engineering`, {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "fulldev-bot/0.1.0"
        }
      });

      if (!response.ok) {
        throw new Error(`Jobicy request failed with HTTP ${response.status}`);
      }

      const data = jobicyResponseSchema.parse(await response.json());
      const jobs = data.jobs.map((job) => normalizeJobicyJob(job));
      logger.info({ provider: this.name, count: jobs.length }, "Job provider completed");
      return jobs;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function normalizeJobicyJob(job: JobicyJob): NormalizedJob {
  const url = normalizeUrl(job.url);
  const searchText = [job.jobTitle, job.jobIndustry, job.jobLevel, job.jobExcerpt, job.jobDescription].join(" ");
  const publishedAt = job.pubDate ? new Date(job.pubDate) : undefined;

  return {
    externalId: String(job.id),
    source: "Jobicy",
    title: job.jobTitle.trim(),
    company: job.companyName.trim(),
    location: normalizeOptionalText(job.jobGeo),
    remote: true,
    level: inferLevel([job.jobLevel, job.jobTitle].join(" ")),
    category: inferCategory(searchText),
    technologies: extractTechnologies(searchText),
    url,
    fingerprint: createJobFingerprint({
      company: job.companyName,
      title: job.jobTitle,
      url
    }),
    publishedAt: publishedAt && Number.isFinite(publishedAt.getTime()) ? publishedAt : undefined,
    discoveredAt: new Date()
  };
}

function normalizeOptionalText(value: string): string | undefined {
  const text = value.trim();
  return text.length > 0 && text.toLowerCase() !== "anywhere" ? text : undefined;
}
