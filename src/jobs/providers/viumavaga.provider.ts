import { z } from "zod";
import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { createJobFingerprint, extractTechnologies, inferCategory, inferLevel, normalizeUrl } from "../job.normalizer.js";
import type { NormalizedJob } from "../job.types.js";
import type { JobProvider } from "./provider.interface.js";

const viumavagaJobSchema = z.object({
  titulo: z.string().min(1),
  resumo: z.string().nullable().optional(),
  url: z.string().url(),
  data_publicacao: z.string().optional(),
  fonte: z.string().optional(),
  empresa: z.string().optional(),
  local: z.string().optional(),
  modelo_trabalho: z.string().optional()
});

const viumavagaResponseSchema = z.object({
  data: z.array(viumavagaJobSchema),
  pagination: z.object({
    page: z.number(),
    per_page: z.number(),
    total: z.number(),
    total_pages: z.number()
  })
});

type ViumavagaJob = z.infer<typeof viumavagaJobSchema>;

const endpoint = "https://viumavaga.com.br/conecta/wp-json/v1v/v1/vagas";
const pageSize = 50;
const maxPagesPerPoll = 4;

export class ViumavagaProvider implements JobProvider {
  public readonly name = "ViUmaVaga";

  async fetchJobs(): Promise<NormalizedJob[]> {
    if (!env.V1V_API_TOKEN.trim()) {
      throw new Error("V1V_API_TOKEN is required when VIUMAVAGA_JOBS_ENABLED is true");
    }

    logger.info({ provider: this.name }, "Job provider started");

    const jobs: NormalizedJob[] = [];
    let totalPages = 1;

    try {
      for (let page = 1; page <= totalPages && page <= maxPagesPerPoll && jobs.length < env.VIUMAVAGA_JOBS_COUNT; page += 1) {
        const response = await this.fetchPage(page);
        totalPages = Math.min(response.pagination.total_pages, maxPagesPerPoll);

        if (response.data.length === 0) {
          break;
        }

        jobs.push(
          ...response.data
            .map(normalizeViumavagaJob)
            .filter((job) => job.level === "intern" || job.level === "junior" || job.level === "mid")
        );
      }

      const result = jobs.slice(0, env.VIUMAVAGA_JOBS_COUNT);
      logger.info({ provider: this.name, count: result.length }, "Job provider completed");
      return result;
    } catch (err) {
      logger.error({ provider: this.name, err }, "Job provider failed");
      throw err;
    }
  }

  private async fetchPage(page: number): Promise<z.infer<typeof viumavagaResponseSchema>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const url = new URL(endpoint);
      url.searchParams.set("page", String(page));
      url.searchParams.set("per_page", String(pageSize));

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${env.V1V_API_TOKEN}`,
          "user-agent": "fulldev-bot/0.1.0"
        }
      });

      if (!response.ok) {
        throw new Error(`ViUmaVaga request failed with HTTP ${response.status}`);
      }

      return viumavagaResponseSchema.parse(await response.json());
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function normalizeViumavagaJob(job: ViumavagaJob): NormalizedJob {
  // The API explicitly requires the original URL and its partner UTMs to remain intact. Use a
  // clean copy only when calculating the fingerprint, whose helper removes tracking parameters.
  const url = job.url;
  const cleanUrl = normalizeUrl(url);
  const company = job.empresa?.trim() || "Empresa não informada";
  const title = job.titulo.trim();
  const workMode = job.modelo_trabalho?.trim() ?? "";
  const location = job.local?.trim();
  const publicationDate = job.data_publicacao ? new Date(job.data_publicacao) : undefined;
  const searchableText = [title, job.resumo ?? ""].join(" ");

  return {
    externalId: cleanUrl,
    source: "ViUmaVaga",
    title,
    company,
    location: location || undefined,
    remote: /remot[oa]/i.test(workMode),
    level: inferLevel(title),
    category: inferCategory(title),
    technologies: extractTechnologies(searchableText),
    url,
    fingerprint: createJobFingerprint({ company, title, url }),
    publishedAt: publicationDate && Number.isFinite(publicationDate.getTime()) ? publicationDate : undefined,
    discoveredAt: new Date()
  };
}
