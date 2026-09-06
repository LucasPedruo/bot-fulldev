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

function formatDate(date?: Date): string {
  if (!date) {
    return "Data a definir";
  }

  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
