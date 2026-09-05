import { z } from "zod";
import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { createJobFingerprint, extractTechnologies, inferCategory, inferLevel, normalizeUrl } from "../job.normalizer.js";
import type { NormalizedJob } from "../job.types.js";
import type { JobProvider } from "./provider.interface.js";

const remoteokJobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  slug: z.string().optional().default(""),
  url: z.string().url().optional(),
  apply_url: z.string().url().optional(),
  position: z.string().min(1),
  company: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
  location: z.string().optional().default(""),
  date: z.string().optional(),
  description: z.string().optional().default("")
});

const remoteokLegalNoticeSchema = z.object({
  legal: z.string()
});

const remoteokResponseSchema = z.array(z.union([remoteokLegalNoticeSchema, remoteokJobSchema]));

type RemoteokJob = z.infer<typeof remoteokJobSchema>;

const techRoleKeywords =
  /\bdev(eloper)?\b|\bengineer(ing)?\b|\bprogrammer\b|\bsoftware\b|front[\s-]?end|back[\s-]?end|full[\s-]?stack|devops|\bsre\b|\bqa\b|quality assurance|data (scientist|engineer|analyst)|machine learning|\bml\b\W|artificial intelligence|mobile developer|\bios\b|\bandroid\b/i;

export class RemoteokProvider implements JobProvider {
  public readonly name = "RemoteOK";

  async fetchJobs(): Promise<NormalizedJob[]> {
    logger.info({ provider: this.name }, "Job provider started");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch("https://remoteok.com/api", {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "fulldev-bot/0.1.0"
        }
      });

      if (!response.ok) {
        throw new Error(`RemoteOK request failed with HTTP ${response.status}`);
      }

      const entries = remoteokResponseSchema.parse(await response.json());
      const jobs = entries
        .filter((entry): entry is RemoteokJob => !("legal" in entry))
        .filter(isTechJob)
        .slice(0, env.REMOTEOK_JOBS_COUNT)
        .map((job) => normalizeRemoteokJob(job));

      logger.info({ provider: this.name, count: jobs.length }, "Job provider completed");
      return jobs;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function normalizeRemoteokJob(job: RemoteokJob): NormalizedJob {
  const rawUrl = job.apply_url ?? job.url ?? `https://remoteok.com/remote-jobs/${job.slug}`;
  const url = normalizeUrl(rawUrl);
  const tagText = job.tags.join(" ");
  const classificationText = [job.position, tagText].join(" ");
  const technologyText = [classificationText, stripHtml(job.description)].join(" ");
  const publishedAt = job.date ? new Date(job.date) : undefined;

  return {
    externalId: String(job.id),
    source: "RemoteOK",
    title: job.position.trim(),
    company: job.company.trim(),
    location: normalizeOptionalText(job.location),
    remote: true,
    level: inferLevel(classificationText),
    category: inferCategory(classificationText),
    technologies: extractTechnologies(technologyText),
    url,
    fingerprint: createJobFingerprint({
      company: job.company,
      title: job.position,
      url
    }),
    publishedAt: publishedAt && Number.isFinite(publishedAt.getTime()) ? publishedAt : undefined,
    discoveredAt: new Date()
  };
}

function isTechJob(job: RemoteokJob): boolean {
  // Tags and descriptions are free text on RemoteOK (a generalist board) and routinely contain
  // unrelated matches (tag "react" on a store manager role, "engineering" mentioned in a support
  // job's description). Only the job title is precise enough to gate on.
  return extractTechnologies(job.position).length > 0 || techRoleKeywords.test(job.position);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function normalizeOptionalText(value: string): string | undefined {
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}
