import { z } from "zod";
import { logger } from "../../shared/logger.js";
import { createEventFingerprint, slugify } from "../event.normalizer.js";
import type { EventModality, NormalizedEvent } from "../event.types.js";
import type { EventProvider } from "./provider.interface.js";

const eventoSchema = z.object({
  nome: z.string().min(1),
  data: z.array(z.string()).optional(),
  url: z.string().url(),
  cidade: z.string().optional().default(""),
  uf: z.string().optional().default(""),
  tipo: z.enum(["presencial", "online", "híbrido"])
});

const mesSchema = z.object({
  mes: z.string(),
  arquivado: z.boolean().optional().default(false),
  eventos: z.array(eventoSchema)
});

const anoSchema = z.object({
  ano: z.number(),
  arquivado: z.boolean().optional().default(false),
  meses: z.array(mesSchema)
});

const databaseSchema = z.object({
  eventos: z.array(anoSchema),
  tba: z.array(eventoSchema).optional().default([])
});

export type RawAgendaEvent = z.infer<typeof eventoSchema>;

// The source's own "mes" field uses these exact lowercase PT-BR names.
const monthIndexByName: Record<string, number> = {
  janeiro: 0,
  fevereiro: 1,
  março: 2,
  abril: 3,
  maio: 4,
  junho: 5,
  julho: 6,
  agosto: 7,
  setembro: 8,
  outubro: 9,
  novembro: 10,
  dezembro: 11
};

const modalityByTipo: Record<string, EventModality> = {
  presencial: "in_person",
  online: "online",
  híbrido: "hybrid"
};

export class AgendaTechBrasilProvider implements EventProvider {
  public readonly name = "AgendaTechBrasil";

  async fetchEvents(): Promise<NormalizedEvent[]> {
    logger.info({ provider: this.name }, "Event provider started");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch("https://raw.githubusercontent.com/agenda-tech-brasil/agenda-tech-brasil/main/src/db/database.json", {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "fulldev-bot/0.1.0"
        }
      });

      if (!response.ok) {
        throw new Error(`Agenda Tech Brasil request failed with HTTP ${response.status}`);
      }

      const data = databaseSchema.parse(await response.json());
      const events: NormalizedEvent[] = [];
      const todayStart = startOfToday();

      for (const ano of data.eventos) {
        if (ano.arquivado) {
          continue;
        }

        for (const mes of ano.meses) {
          if (mes.arquivado) {
            continue;
          }

          const monthIndex = monthIndexByName[normalizeMonth(mes.mes)];
          if (monthIndex === undefined) {
            logger.warn({ provider: this.name, mes: mes.mes }, "Unknown month name, skipping");
            continue;
          }

          for (const raw of mes.eventos) {
            const event = normalizeDatedEvent(raw, ano.ano, monthIndex);

            if (event.startDate && event.startDate.getTime() < todayStart.getTime()) {
              continue;
            }

            events.push(event);
          }
        }
      }

      for (const raw of data.tba) {
        events.push(normalizeTbaEvent(raw));
      }

      logger.info({ provider: this.name, count: events.length }, "Event provider completed");
      return events;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function normalizeDatedEvent(raw: RawAgendaEvent, year: number, monthIndex: number): NormalizedEvent {
  const firstDay = Number(raw.data?.[0] ?? "1");
  const startDate = new Date(year, monthIndex, firstDay, 0, 0, 0, 0);
  const externalId = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(firstDay).padStart(2, "0")}-${slugify(raw.nome)}`;

  return {
    externalId,
    source: "AgendaTechBrasil",
    title: raw.nome.trim(),
    location: buildLocation(raw),
    modality: modalityByTipo[raw.tipo] ?? "in_person",
    url: raw.url,
    fingerprint: createEventFingerprint({ title: raw.nome, url: raw.url, startDate }),
    startDate,
    discoveredAt: new Date()
  };
}

export function normalizeTbaEvent(raw: RawAgendaEvent): NormalizedEvent {
  const externalId = `tba-${slugify(raw.nome)}`;

  return {
    externalId,
    source: "AgendaTechBrasil",
    title: raw.nome.trim(),
    location: buildLocation(raw),
    modality: modalityByTipo[raw.tipo] ?? "in_person",
    url: raw.url,
    fingerprint: createEventFingerprint({ title: raw.nome, url: raw.url }),
    startDate: undefined,
    discoveredAt: new Date()
  };
}

function buildLocation(raw: RawAgendaEvent): string | undefined {
  const parts = [raw.cidade, raw.uf].filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join("/") : undefined;
}

function normalizeMonth(value: string): string {
  return value.trim().toLowerCase();
}

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}
