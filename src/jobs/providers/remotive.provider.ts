import { z } from "zod";
import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { createJobFingerprint, extractTechnologies, inferCategory, inferLevel, normalizeUrl } from "../job.normalizer.js";
import type { JobCategory, NormalizedJob } from "../job.types.js";
import type { JobProvider } from "./provider.interface.js";

const remotiveJobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  url: z.string().url(),
  title: z.string().min(1),
  company_name: z.string().min(1),
  category: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  job_type: z.string().optional().default(""),
  publication_date: z.string().optional(),
  candidate_required_location: z.string().optional().default(""),
  description: z.string().optional().default("")
});

const remotiveResponseSchema = z.object({
  jobs: z.array(remotiveJobSchema)
});

type RemotiveJob = z.infer<typeof remotiveJobSchema>;

const allowedCategories = new Set([
  "Software Development",
  "Quality Assurance",
  "Devops",
  "Data and Analytics",
  "Artificial Intelligence",
  "Engineering",
  "Information Technology",
  "Design"
]);

export class RemotiveProvider implements JobProvider {
  public readonly name = "Remotive";

  async fetchJobs(): Promise<NormalizedJob[]> {
    logger.info({ provider: this.name }, "Job provider started");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(
        `https://remotive.com/api/remote-jobs?category=software-development&limit=${env.REMOTIVE_JOBS_COUNT}`,
        {
          signal: controller.signal,
          headers: {
            accept: "application/json",
            "user-agent": "fulldev-bot/0.1.0"
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Remotive request failed with HTTP ${response.status}`);
      }

      const data = remotiveResponseSchema.parse(await response.json());
      const jobs = data.jobs.filter(isTechJob).slice(0, env.REMOTIVE_JOBS_COUNT).map((job) => normalizeRemotiveJob(job));
      logger.info({ provider: this.name, count: jobs.length }, "Job provider completed");
      return jobs;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function normalizeRemotiveJob(job: RemotiveJob): NormalizedJob {
  const url = normalizeUrl(job.url);
  const tagText = job.tags.join(" ");
  const classificationText = [job.title, job.category, job.job_type, tagText].join(" ");
  const technologyText = [classificationText, stripHtml(job.description)].join(" ");
  const publishedAt = job.publication_date ? new Date(job.publication_date) : undefined;

  return {
    externalId: String(job.id),
    source: "Remotive",
    title: job.title.trim(),
    company: job.company_name.trim(),
    location: normalizeOptionalText(job.candidate_required_location),
    remote: true,
    level: inferLevel(classificationText),
    category: mapRemotiveCategory(job.category, classificationText),
    technologies: extractTechnologies(technologyText),
    url,
    fingerprint: createJobFingerprint({
      company: job.company_name,
      title: job.title,
      url
    }),
    publishedAt: publishedAt && Number.isFinite(publishedAt.getTime()) ? publishedAt : undefined,
    discoveredAt: new Date()
  };
}

function isTechJob(job: RemotiveJob): boolean {
  return allowedCategories.has(job.category);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function normalizeOptionalText(value: string): string | undefined {
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

function mapRemotiveCategory(category: string, fallbackText: string): JobCategory {
  switch (category) {
    case "Quality Assurance":
      return "qa";
    case "Devops":
      return "devops";
    case "Data and Analytics":
    case "Artificial Intelligence":
      return "data";
    case "Design":
      return "design";
    case "Software Development":
    case "Engineering":
    case "Information Technology":
      return inferCategory(fallbackText);
    default:
      return "other";
  }
}
