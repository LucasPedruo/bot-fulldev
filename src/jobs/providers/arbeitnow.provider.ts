import { z } from "zod";
import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { createJobFingerprint, extractTechnologies, inferCategory, inferLevel, normalizeUrl } from "../job.normalizer.js";
import type { NormalizedJob } from "../job.types.js";
import type { JobProvider } from "./provider.interface.js";

const arbeitnowJobSchema = z.object({
  slug: z.string().min(1),
  company_name: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().default(""),
  remote: z.boolean().optional().default(false),
  url: z.string().url(),
  tags: z.array(z.string()).optional().default([]),
  job_types: z.array(z.string()).optional().default([]),
  location: z.string().optional().default(""),
  created_at: z.number().optional()
});

const arbeitnowResponseSchema = z.object({
  data: z.array(arbeitnowJobSchema)
});

type ArbeitnowJob = z.infer<typeof arbeitnowJobSchema>;

const techRoleKeywords =
  /\bdev(eloper)?\b|\bengineer(ing)?\b|\bprogrammer\b|\bsoftware\b|front[\s-]?end|back[\s-]?end|full[\s-]?stack|devops|\bsre\b|\bqa\b|quality assurance|data (scientist|engineer|analyst)|machine learning|\bml\b\W|artificial intelligence|mobile developer|\bios\b|\bandroid\b/i;

export class ArbeitnowProvider implements JobProvider {
  public readonly name = "Arbeitnow";

  async fetchJobs(): Promise<NormalizedJob[]> {
    logger.info({ provider: this.name }, "Job provider started");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch("https://www.arbeitnow.com/api/job-board-api", {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "fulldev-bot/0.1.0"
        }
      });

      if (!response.ok) {
        throw new Error(`Arbeitnow request failed with HTTP ${response.status}`);
      }

      const data = arbeitnowResponseSchema.parse(await response.json());
      const jobs = data.data
        .filter((job) => job.remote)
        .filter(isTechJob)
        .slice(0, env.ARBEITNOW_JOBS_COUNT)
        .map((job) => normalizeArbeitnowJob(job));

      logger.info({ provider: this.name, count: jobs.length }, "Job provider completed");
      return jobs;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function normalizeArbeitnowJob(job: ArbeitnowJob): NormalizedJob {
  const url = normalizeUrl(job.url);
  const tagText = job.tags.join(" ");
  const jobTypeText = job.job_types.join(" ");
  const classificationText = [job.title, tagText, jobTypeText].join(" ");
  const technologyText = [classificationText, stripMarkup(job.description)].join(" ");
  const publishedAt = job.created_at ? new Date(job.created_at * 1000) : undefined;

  return {
    externalId: job.slug,
    source: "Arbeitnow",
    title: job.title.trim(),
    company: job.company_name.trim(),
    location: normalizeOptionalText(job.location),
    remote: true,
    level: inferLevel(classificationText),
    category: inferCategory(classificationText),
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

function isTechJob(job: ArbeitnowJob): boolean {
  // Tags and descriptions are free text on Arbeitnow (a generalist board) and routinely contain
  // unrelated matches (tag "Engineering" on a consulting role, "engineering" mentioned in an
  // unrelated description). Only the job title is precise enough to gate on.
  return extractTechnologies(job.title).length > 0 || techRoleKeywords.test(job.title);
}

function stripMarkup(value: string): string {
  return value.replace(/&lt;[^&]*?&gt;/g, " ").replace(/<[^>]*>/g, " ");
}

function normalizeOptionalText(value: string): string | undefined {
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}
