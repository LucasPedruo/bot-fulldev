import { z } from "zod";
import { logger } from "../../shared/logger.js";
import { createEventFingerprint, isTechEventTitle } from "../event.normalizer.js";
import type { EventModality, NormalizedEvent } from "../event.types.js";
import type { EventProvider } from "./provider.interface.js";

// Only Brazilian city slugs confirmed to resolve to a real "discover-place" event feed (checked live
// via luma.com/<slug>) - other guessed slugs either redirect to the generic /discover page or 404.
const lumaCitySlugs = ["saopaulo", "rio"];

// Deliberately narrow: only event-level facts. Luma's own per-city feed embeds `hosts`,
// `featured_guests`, `host_info` and `guest_info` alongside each event - those keys are never read
// here and never reach NormalizedEvent, per explicit instruction to never extract personal data of
// hosts or guests even though it is present in the same payload.
const lumaEventSchema = z.object({
  api_id: z.string().min(1),
  name: z.string().min(1),
  start_at: z.string(),
  location_type: z.string().optional(),
  url: z.string().min(1),
  geo_address_info: z
    .object({
      city_state: z.string().optional(),
      country: z.string().optional()
    })
    .optional()
});

const lumaEventEntrySchema = z
  .object({
    event: lumaEventSchema
  })
  .passthrough();

const lumaPageDataSchema = z
  .object({
    kind: z.string(),
    data: z
      .object({
        events: z.array(lumaEventEntrySchema).optional().default([])
      })
      .passthrough()
  })
  .passthrough();

const lumaNextDataSchema = z
  .object({
    props: z
      .object({
        pageProps: z
          .object({
            initialData: lumaPageDataSchema
          })
          .passthrough()
      })
      .passthrough()
  })
  .passthrough();

const modalityByLocationType: Record<string, EventModality> = {
  offline: "in_person",
  virtual: "online",
  hybrid: "hybrid"
};

export class LumaProvider implements EventProvider {
  public readonly name = "Luma";

  async fetchEvents(): Promise<NormalizedEvent[]> {
    logger.info({ provider: this.name }, "Event provider started");

    const events: NormalizedEvent[] = [];
    const todayStart = startOfToday();

    for (const citySlug of lumaCitySlugs) {
      try {
        const cityEvents = await this.fetchCity(citySlug);

        for (const raw of cityEvents) {
          if (!isTechEventTitle(raw.name)) {
            continue;
          }

          const normalized = normalizeLumaEvent(raw);
          if (normalized.startDate && normalized.startDate.getTime() < todayStart.getTime()) {
            continue;
          }

          events.push(normalized);
        }
      } catch (err) {
        logger.error({ provider: this.name, citySlug, err }, "Luma city feed failed");
      }
    }

    logger.info({ provider: this.name, count: events.length }, "Event provider completed");
    return events;
  }

  private async fetchCity(citySlug: string): Promise<z.infer<typeof lumaEventSchema>[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`https://luma.com/${citySlug}`, {
        signal: controller.signal,
        headers: {
          accept: "text/html",
          "user-agent": "fulldev-bot/0.1.0"
        }
      });

      if (!response.ok) {
        throw new Error(`Luma request failed with HTTP ${response.status}`);
      }

      const html = await response.text();
      const match = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      if (!match) {
        throw new Error("Luma page did not contain __NEXT_DATA__");
      }

      const page = lumaNextDataSchema.parse(JSON.parse(match[1]));
      if (page.props.pageProps.initialData.kind !== "discover-place") {
        return [];
      }

      return page.props.pageProps.initialData.data.events.map((entry) => entry.event);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function normalizeLumaEvent(raw: z.infer<typeof lumaEventSchema>): NormalizedEvent {
  const url = `https://luma.com/${raw.url}`;
  const startDate = new Date(raw.start_at);

  return {
    externalId: `luma-${raw.api_id}`,
    source: "Luma",
    title: raw.name.trim(),
    location: raw.geo_address_info?.city_state,
    modality: modalityByLocationType[raw.location_type ?? ""] ?? "in_person",
    url,
    fingerprint: createEventFingerprint({ title: raw.name, url, startDate }),
    startDate,
    discoveredAt: new Date()
  };
}

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}
