import { z } from "zod";
import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { createJobFingerprint, extractTechnologies, inferCategory, inferLevel, normalizeForMatch, normalizeUrl } from "../job.normalizer.js";
import type { NormalizedJob } from "../job.types.js";
import type { JobProvider } from "./provider.interface.js";

const greenhouseJobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string().min(1),
  absolute_url: z.string().url(),
  location: z.object({ name: z.string().optional().default("") }).optional(),
  updated_at: z.string().optional()
});

const greenhouseResponseSchema = z.object({
  jobs: z.array(greenhouseJobSchema)
});

type GreenhouseJob = z.infer<typeof greenhouseJobSchema>;

// Each Greenhouse "board" is a single company's own career site, so there is no cross-company
// search here (unlike Himalayas) — every slug below was confirmed by hand to be a real, live
// Brazilian tech employer's public Greenhouse board.
const companyNameBySlug: Record<string, string> = {
  nubank: "Nubank",
  stone: "Stone",
  quintoandar: "QuintoAndar",
  gympass: "Gympass",
  ebanx: "EBANX",
  wildlifestudios: "Wildlife Studios",
  vtex: "VTEX",
  rdstation: "RD Station",
  inter: "Banco Inter",
  c6bank: "C6 Bank"
};

// Same bilingual title-only heuristic as the Himalayas provider (see its comments for why tags
// and descriptions are unreliable), reused here since Greenhouse boards have the same problem:
// most of a general company's postings are sales/ops/support, not engineering.
const techQualifier =
  "software|data|dados|systems|sistemas|platform|plataforma|cloud|nuvem|security|seguranca|network|rede|qa|machine learning|\\bai\\b|\\bia\\b|product|mobile|frontend|backend|infrastructure|infraestrutura";
const techRoleKeywords = new RegExp(
  "\\bdev(eloper)?\\b|desenvolvedor|programador|\\bprogrammer\\b|\\bsoftware\\b|front[\\s-]?end|back[\\s-]?end|full[\\s-]?stack|devops|\\bsre\\b|\\bqa\\b|quality assurance|qualidade de software|testador|cientista de dados|analista de dados|analista de sistemas|arquiteto de software|machine learning|\\bml\\b\\W|artificial intelligence|inteligencia artificial|\\bios\\b|\\bandroid\\b|" +
    `(${techQualifier})\\s+\\b(?:engineer|engenheiro)\\b|\\b(?:engineer|engenheiro)\\b\\s+(?:of|de)\\s+(?:${techQualifier})`,
  "i"
);

export class GreenhouseProvider implements JobProvider {
  public readonly name = "Greenhouse";

  async fetchJobs(): Promise<NormalizedJob[]> {
    logger.info({ provider: this.name }, "Job provider started");

    const boards = await Promise.allSettled(env.GREENHOUSE_BOARD_SLUGS.split(",").map((slug) => this.fetchBoard(slug.trim())));

    const jobs: NormalizedJob[] = [];

    for (const board of boards) {
      if (board.status === "fulfilled") {
        jobs.push(...board.value);
      } else {
        logger.error({ provider: this.name, err: board.reason }, "Greenhouse board fetch failed");
      }
    }

    const result = jobs.slice(0, env.GREENHOUSE_JOBS_COUNT);
    logger.info({ provider: this.name, count: result.length }, "Job provider completed");
    return result;
  }

  private async fetchBoard(slug: string): Promise<NormalizedJob[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`, {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "fulldev-bot/0.1.0"
        }
      });

      if (!response.ok) {
        throw new Error(`Greenhouse request failed for board "${slug}" with HTTP ${response.status}`);
      }

      const data = greenhouseResponseSchema.parse(await response.json());
      const companyName = companyNameBySlug[slug] ?? slug;

      return data.jobs
        .filter(isTechJob)
        .map((job) => normalizeGreenhouseJob(job, companyName))
        .filter((job) => job.level === "intern" || job.level === "junior" || job.level === "mid");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function normalizeGreenhouseJob(job: GreenhouseJob, companyName: string): NormalizedJob {
  const url = normalizeUrl(job.absolute_url);
  const location = job.location?.name.trim();
  const remote = /remoto|remote|home[\s-]?office/i.test(location ?? "");
  const publishedAt = job.updated_at ? new Date(job.updated_at) : undefined;

  return {
    externalId: String(job.id),
    source: "Greenhouse",
    title: job.title.trim(),
    company: companyName,
    location: location && location.length > 0 ? location : undefined,
    remote,
    level: inferLevel(job.title),
    category: inferCategory(job.title),
    technologies: extractTechnologies(job.title),
    url,
    fingerprint: createJobFingerprint({
      company: companyName,
      title: job.title,
      url
    }),
    publishedAt: publishedAt && Number.isFinite(publishedAt.getTime()) ? publishedAt : undefined,
    discoveredAt: new Date()
  };
}

function isTechJob(job: GreenhouseJob): boolean {
  const title = normalizeForMatch(job.title);
  return extractTechnologies(title).length > 0 || techRoleKeywords.test(title);
}
