import { z } from "zod";
import { logger } from "../shared/logger.js";

const devtoArticleSchema = z.object({
  title: z.string().min(1),
  url: z.string().url()
});

const devtoResponseSchema = z.array(devtoArticleSchema);

export type DevToArticle = {
  title: string;
  url: string;
};

export async function fetchTopDevToArticle(): Promise<DevToArticle | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch("https://dev.to/api/articles?top=1&per_page=10", {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "fulldev-bot/0.1.0"
      }
    });

    if (!response.ok) {
      throw new Error(`Dev.to request failed with HTTP ${response.status}`);
    }

    const articles = devtoResponseSchema.parse(await response.json());
    if (articles.length === 0) {
      return undefined;
    }

    return articles[Math.floor(Math.random() * articles.length)];
  } catch (err) {
    logger.error({ err }, "Dev.to fetch failed");
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export function formatDevToMessage(article: DevToArticle): string {
  return `Vocês viram essa? ${article.title}\n${article.url}`;
}
