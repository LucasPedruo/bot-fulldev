import * as cheerio from "cheerio";
import { logger } from "../../shared/logger.js";
import { createEventFingerprint, slugify } from "../event.normalizer.js";
import type { EventModality, NormalizedEvent } from "../event.types.js";
import type { EventProvider } from "./provider.interface.js";

const modalityByLabel: Record<string, EventModality> = {
  presencial: "in_person",
  online: "online",
  hibrido: "hybrid"
};

const dateTimePattern = /De:\s*(\d{2})\/(\d{2})\/(\d{4})\s*[àa]s\s*(\d{2}):(\d{2}):(\d{2})/i;

export type RawEventostiCard = {
  title: string;
  url: string;
  modalityLabel: string;
  metas: string[];
};

export class EventostiDevProvider implements EventProvider {
  public readonly name = "EventostiDev";

  async fetchEvents(): Promise<NormalizedEvent[]> {
    logger.info({ provider: this.name }, "Event provider started");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch("https://eventosti.dev/", {
        signal: controller.signal,
        headers: {
          accept: "text/html",
          "user-agent": "fulldev-bot/0.1.0"
        }
      });

      if (!response.ok) {
        throw new Error(`EventostiDev request failed with HTTP ${response.status}`);
      }

      const html = await response.text();
      const cards = parseCards(html);
      const todayStart = startOfToday();
      const events = cards
        .map(normalizeEventostiCard)
        .filter((event): event is NormalizedEvent => event !== undefined)
        .filter((event) => !event.startDate || event.startDate.getTime() >= todayStart.getTime());

      logger.info({ provider: this.name, count: events.length }, "Event provider completed");
      return events;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function parseCards(html: string): RawEventostiCard[] {
  const $ = cheerio.load(html);
  const cards: RawEventostiCard[] = [];

  $("#proximos-eventos-section .card").each((_, element) => {
    const card = $(element);
    const titleAnchor = card.find(".card-title a").first();
    const title = titleAnchor.text().trim();
    const url = titleAnchor.attr("href")?.trim();

    if (!title || !url) {
      return;
    }

    const modalityLabel = card.find(".card-text .badge").first().text().trim();
    const metas = card
      .find(".card-text .meta")
      .map((_i, meta) => $(meta).text().replace(/\s+/g, " ").trim())
      .get();

    cards.push({ title, url, modalityLabel, metas });
  });

  return cards;
}

export function normalizeEventostiCard(raw: RawEventostiCard): NormalizedEvent | undefined {
  const dateMeta = raw.metas.find((meta) => meta.startsWith("De:"));
  const match = dateMeta ? dateTimePattern.exec(dateMeta) : null;

  if (!match) {
    logger.warn({ provider: "EventostiDev", title: raw.title }, "Could not parse start date, skipping card");
    return undefined;
  }

  const [, day, month, year, hour, minute] = match;
  const startDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
  const location = raw.metas.find((meta) => !meta.startsWith("De:") && !meta.startsWith("Até:"));
  const externalId = `${year}-${month}-${day}-${slugify(raw.title)}`;

  return {
    externalId,
    source: "EventostiDev",
    title: raw.title,
    location,
    modality: modalityByLabel[normalizeModalityLabel(raw.modalityLabel)] ?? "in_person",
    url: raw.url,
    fingerprint: createEventFingerprint({ title: raw.title, url: raw.url, startDate }),
    startDate,
    discoveredAt: new Date()
  };
}

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function normalizeModalityLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
