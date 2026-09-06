import type { EventQuery } from "./event-query.js";
import type { EventNotificationType, NormalizedEvent } from "./event.types.js";

const modalityLabels: Record<NormalizedEvent["modality"], string> = {
  in_person: "Presencial",
  online: "Online",
  hybrid: "Híbrido"
};

const reminderIntros: Partial<Record<EventNotificationType, string>> = {
  event_7_days: "Faltam 7 dias para",
  event_3_days: "Faltam 3 dias para",
  event_tomorrow: "Amanhã é",
  event_today: "Hoje é"
};

export function formatNewEventMessage(event: NormalizedEvent): string {
  const lines = ["Novo evento", "", event.title, "", formatDate(event.startDate), modalityLabels[event.modality]];

  if (event.location) {
    lines.push(event.location);
  }

  lines.push("", "Saiba mais:", event.url, "", `Fonte: ${event.source}`);

  return lines.join("\n");
}

export function formatEventReminderMessage(event: NormalizedEvent, type: EventNotificationType): string {
  const intro = reminderIntros[type] ?? "Lembrete sobre";
  const lines = [`${intro} ${event.title}`, "", formatDate(event.startDate), modalityLabels[event.modality]];

  if (event.location) {
    lines.push(event.location);
  }

  lines.push("", "Saiba mais:", event.url, "", `Fonte: ${event.source}`);

  return lines.join("\n");
}

const monthNames = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
];

export function formatEventQueryReply(events: NormalizedEvent[], query: EventQuery): string {
  const criteria = describeQueryCriteria(query);

  if (events.length === 0) {
    return `Não encontrei eventos ${criteria} no que já descobri até agora.`;
  }

  const lines = [`Eventos ${criteria}:`, ""];

  for (const event of events) {
    lines.push(`• ${event.title} — ${formatDate(event.startDate)}${event.location ? ` (${event.location})` : ""}`);
    lines.push(`  ${event.url}`);
  }

  return lines.join("\n");
}

export function formatEventPromoDescription(event: NormalizedEvent): string {
  const lines = [event.location ?? "Local a confirmar", "", "Saiba mais:", event.url, "", `Fonte: ${event.source}`];
  return lines.join("\n");
}

function describeQueryCriteria(query: EventQuery): string {
  if (query.month !== undefined) {
    return `em ${monthNames[query.month]}${query.location ? ` em ${query.location}` : ""}`;
  }

  if (query.location) {
    return `em ${query.location}`;
  }

  return "próximos";
}

function formatDate(date?: Date): string {
  if (!date) {
    return "Data a definir";
  }

  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
