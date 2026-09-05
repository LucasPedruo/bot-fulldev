import { z } from "zod";
import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { createJobFingerprint, extractTechnologies, inferCategory, inferLevel, normalizeForMatch, normalizeUrl } from "../job.normalizer.js";
import type { JobLevel, NormalizedJob } from "../job.types.js";
import type { JobProvider } from "./provider.interface.js";

const himalayasJobSchema = z.object({
  title: z.string().min(1),
  companyName: z.string().min(1),
  seniority: z.array(z.string()).optional().default([]),
  locationRestrictions: z.array(z.string()).optional().default([]),
  description: z.string().optional().default(""),
  pubDate: z.number().optional(),
  applicationLink: z.string().url(),
  guid: z.string().min(1)
});

const himalayasResponseSchema = z.object({
  totalCount: z.number(),
  jobs: z.array(himalayasJobSchema)
});

type HimalayasJob = z.infer<typeof himalayasJobSchema>;

const pageSize = 20;
const maxPages = 5;

// Brazilian tech job titles mix English role words (Developer, Engineer) with their Portuguese
// equivalents (Desenvolvedor, Engenheiro), so both must be covered here. Unlike "developer", a
// bare "engineer"/"engenheiro" is not software-specific in the general Brazilian job market (civil,
// production, budgeting/"orçamentista" engineers all use the word), so it only counts alongside a
// tech qualifier. Titles are diacritic-stripped before testing, so patterns are written unaccented.
const techQualifier =
  "software|data|dados|systems|sistemas|platform|plataforma|cloud|nuvem|security|seguranca|network|rede|qa|machine learning|\\bai\\b|\\bia\\b|product|mobile|frontend|backend|infrastructure|infraestrutura";
const techRoleKeywords = new RegExp(
  "\\bdev(eloper)?\\b|desenvolvedor|programador|\\bprogrammer\\b|\\bsoftware\\b|front[\\s-]?end|back[\\s-]?end|full[\\s-]?stack|devops|\\bsre\\b|\\bqa\\b|quality assurance|qualidade de software|testador|cientista de dados|analista de dados|analista de sistemas|arquiteto de software|machine learning|\\bml\\b\\W|artificial intelligence|inteligencia artificial|\\bios\\b|\\bandroid\\b|" +
    `(${techQualifier})\\s+\\b(?:engineer|engenheiro)\\b|\\b(?:engineer|engenheiro)\\b\\s+(?:of|de)\\s+(?:${techQualifier})`,
  "i"
);

export class HimalayasProvider implements JobProvider {
  public readonly name = "Himalayas";

  async fetchJobs(): Promise<NormalizedJob[]> {
    logger.info({ provider: this.name }, "Job provider started");

    const jobs: NormalizedJob[] = [];

    try {
      for (let page = 1; page <= maxPages && jobs.length < env.HIMALAYAS_JOBS_COUNT; page += 1) {
        const entries = await this.fetchPage(page);

        if (entries.length === 0) {
          break;
        }

        for (const job of entries) {
          if (isTechJob(job)) {
            jobs.push(normalizeHimalayasJob(job));
          }
        }
      }

      const result = jobs.slice(0, env.HIMALAYAS_JOBS_COUNT);
      logger.info({ provider: this.name, count: result.length }, "Job provider completed");
      return result;
    } catch (err) {
      logger.error({ provider: this.name, err }, "Job provider failed mid-pagination");
      throw err;
    }
  }

  private async fetchPage(page: number): Promise<HimalayasJob[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const url = new URL("https://himalayas.app/jobs/api/search");
      url.searchParams.set("country", "Brazil");
      url.searchParams.set("seniority", "Entry-level,Mid-level");
      url.searchParams.set("limit", String(pageSize));
      url.searchParams.set("page", String(page));

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "fulldev-bot/0.1.0"
        }
      });

      if (!response.ok) {
        throw new Error(`Himalayas request failed with HTTP ${response.status}`);
      }

      const data = himalayasResponseSchema.parse(await response.json());
      return data.jobs;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function normalizeHimalayasJob(job: HimalayasJob): NormalizedJob {
  const url = normalizeUrl(job.applicationLink);
  const publishedAt = job.pubDate ? new Date(job.pubDate * 1000) : undefined;
  const location = job.locationRestrictions.includes("Brazil") ? "Brasil" : undefined;

  return {
    externalId: job.guid,
    source: "Himalayas",
    title: job.title.trim(),
    company: job.companyName.trim(),
    location,
    remote: true,
    level: inferLevel(job.title) ?? mapSeniorityToLevel(job.seniority),
    category: inferCategory(job.title),
    technologies: extractTechnologies([job.title, stripHtml(job.description)].join(" ")),
    url,
    fingerprint: createJobFingerprint({
      company: job.companyName,
      title: job.title,
      url
    }),
    publishedAt: publishedAt && Number.isFinite(publishedAt.getTime()) ? publishedAt : undefined,
    discoveredAt: new Date()
  };
}

function isTechJob(job: HimalayasJob): boolean {
  // Himalayas' own parentCategories taxonomy is inconsistently populated (empty even for clearly
  // technical roles), so the tech decision relies on the title, same approach as the other
  // generalist-board providers.
  const title = normalizeForMatch(job.title);
  return extractTechnologies(title).length > 0 || techRoleKeywords.test(title);
}

function mapSeniorityToLevel(seniority: string[]): JobLevel | undefined {
  if (seniority.includes("Entry-level")) {
    return "junior";
  }

  if (seniority.includes("Mid-level")) {
    return "mid";
  }

  return undefined;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}
