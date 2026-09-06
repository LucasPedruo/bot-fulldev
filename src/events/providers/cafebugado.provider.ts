import puppeteer, { type Page } from "puppeteer";
import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { createEventFingerprint, normalizePart, slugify } from "../event.normalizer.js";
import type { EventModality, NormalizedEvent } from "../event.types.js";
import type { EventProvider } from "./provider.interface.js";

// eventos.cafebugado.com.br is a Next.js app using React Server Components streaming - the raw
// server response (what fetch()/cheerio would see) embeds event data as unstructured prose with
// inconsistent date formats, no stable schema. The final client-rendered DOM, though, is a clean
// Material-UI card grid (confirmed by inspecting it with a real headless browser) - hence Puppeteer
// here instead of the fetch+cheerio pattern every other provider uses. This is a deliberately
// heavier dependency (real Chromium), accepted by the user for this one source.
const eventsListUrl = "https://eventos.cafebugado.com.br/eventos";

const weekdayNames = new Set(["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]);
const modalityByLabel: Record<string, EventModality> = {
  presencial: "in_person",
  online: "online",
  hibrido: "hybrid"
};

export type RawCafebugadoCard = {
  title: string;
  // Everything printed under the title, in whatever order the site renders it - date/time/weekday/
  // modality/location are told apart by their own value pattern, not by position, since an online
  // event may omit location entirely and shift everything after it.
  fields: string[];
};

export class CafebugadoProvider implements EventProvider {
  public readonly name = "CafeBugado";

  async fetchEvents(): Promise<NormalizedEvent[]> {
    logger.info({ provider: this.name }, "Event provider started");

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    try {
      const page = await browser.newPage();
      await page.goto(eventsListUrl, { waitUntil: "networkidle0", timeout: 30_000 });

      const totalPages = await getTotalPages(page);
      const rawCards: RawCafebugadoCard[] = await extractCardsFromCurrentPage(page);

      for (let pageNumber = 2; pageNumber <= totalPages; pageNumber += 1) {
        const navigated = await goToPage(page, pageNumber);
        if (!navigated) {
          logger.warn({ provider: this.name, pageNumber }, "Could not navigate to pagination page, stopping early");
          break;
        }

        rawCards.push(...(await extractCardsFromCurrentPage(page)));
      }

      const todayStart = startOfToday();
      const events = rawCards
        .map(normalizeCafebugadoCard)
        .filter((event): event is NormalizedEvent => event !== undefined)
        .filter((event) => !event.startDate || event.startDate.getTime() >= todayStart.getTime());

      logger.info({ provider: this.name, count: events.length }, "Event provider completed");
      return events;
    } finally {
      await browser.close();
    }
  }
}

export function normalizeCafebugadoCard(raw: RawCafebugadoCard): NormalizedEvent | undefined {
  const dateField = raw.fields.find((field) => /^\d{2}\/\d{2}\/\d{4}$/.test(field));
  if (!raw.title || !dateField) {
    return undefined;
  }

  const timeField = raw.fields.find((field) => /^\d{2}:\d{2}$/.test(field));
  const modalityField = raw.fields.find((field) => normalizePart(field) in modalityByLabel);
  const weekdayField = raw.fields.find((field) => weekdayNames.has(normalizePart(field)));
  const locationField = raw.fields.find(
    (field) => field !== dateField && field !== timeField && field !== modalityField && field !== weekdayField
  );

  const [day, month, year] = dateField.split("/").map(Number);
  const [hour, minute] = (timeField ?? "00:00").split(":").map(Number);
  const startDate = new Date(year, month - 1, day, hour, minute, 0, 0);
  // Per explicit user choice: every event links to the listing page rather than its own detail
  // page - "Saber mais sobre o evento" opens a new tab via a JS click handler, not a plain href,
  // so discovering the real per-event URL would require clicking through every card on every poll.
  const url = eventsListUrl;

  return {
    externalId: `cafebugado-${slugify(raw.title)}-${dateField.replace(/\//g, "-")}`,
    source: "CafeBugado",
    title: raw.title.trim(),
    location: locationField,
    modality: modalityField ? modalityByLabel[normalizePart(modalityField)] : "in_person",
    url,
    fingerprint: createEventFingerprint({ title: raw.title, url, startDate }),
    startDate,
    discoveredAt: new Date()
  };
}

async function getTotalPages(page: Page): Promise<number> {
  return page.evaluate(() => {
    const pageNumbers = Array.from(document.querySelectorAll("button"))
      .map((button) => button.textContent?.trim() ?? "")
      .filter((text) => /^\d+$/.test(text))
      .map(Number);

    return pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
  });
}

async function goToPage(page: Page, pageNumber: number): Promise<boolean> {
  const clicked = await page.evaluate((target) => {
    const button = Array.from(document.querySelectorAll("button")).find((el) => el.textContent?.trim() === String(target));
    if (!button) {
      return false;
    }

    button.click();
    return true;
  }, pageNumber);

  if (!clicked) {
    return false;
  }

  await page.waitForNetworkIdle({ idleTime: 500, timeout: 10_000 }).catch(() => undefined);
  return true;
}

async function extractCardsFromCurrentPage(page: Page): Promise<RawCafebugadoCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".MuiCard-root"));

    return cards.map((card) => {
      const title = card.querySelector("h3")?.textContent?.trim() ?? "";
      const fields = Array.from(card.querySelectorAll(".MuiCardContent-root p"))
        .map((el) => el.textContent?.trim() ?? "")
        .filter((text) => text.length > 0);

      return { title, fields };
    });
  });
}

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}
