import type { NormalizedEvent } from "../event.types.js";

export interface EventProvider {
  name: string;
  fetchEvents(): Promise<NormalizedEvent[]>;
}
