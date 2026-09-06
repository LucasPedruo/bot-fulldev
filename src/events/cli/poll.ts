import { formatNewEventMessage } from "../event.formatter.js";
import { AgendaTechBrasilProvider } from "../providers/agenda-tech-brasil.provider.js";
import { EventostiDevProvider } from "../providers/eventosti-dev.provider.js";
import { LumaProvider } from "../providers/luma.provider.js";
import type { EventProvider } from "../providers/provider.interface.js";

const providerArg = process.argv.find((arg) => arg.startsWith("--provider="));
const providerName = providerArg?.split("=")[1] ?? "agendatechbrasil";

const providersByName: Record<string, () => EventProvider> = {
  agendatechbrasil: () => new AgendaTechBrasilProvider(),
  luma: () => new LumaProvider(),
  eventostidev: () => new EventostiDevProvider()
};

if (process.argv.includes("--dry-run")) {
  const provider = (providersByName[providerName] ?? providersByName.agendatechbrasil)();
  const events = await provider.fetchEvents();
  console.log({
    provider: provider.name,
    fetched: events.length,
    sample: events.slice(0, 5).map((event) => ({
      externalId: event.externalId,
      title: event.title,
      location: event.location,
      modality: event.modality,
      startDate: event.startDate,
      url: event.url
    }))
  });

  if (events[0]) {
    console.log("\nSample WhatsApp message:\n");
    console.log(formatNewEventMessage(events[0]));
  }
} else {
  const { eventService } = await import("../event.service.js");
  const result = await eventService.poll();
  console.log(result);
}
