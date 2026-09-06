export const eventModalities = ["in_person", "online", "hybrid"] as const;
export type EventModality = (typeof eventModalities)[number];

export const eventNotificationTypes = [
  "new_event",
  "registration_open",
  "event_7_days",
  "event_3_days",
  "event_tomorrow",
  "event_today",
  "event_promo"
] as const;
export type EventNotificationType = (typeof eventNotificationTypes)[number];

export type NormalizedEvent = {
  id?: string;
  externalId: string;
  source: string;
  title: string;
  location?: string;
  modality: EventModality;
  url: string;
  // Undefined for "to be announced" events with no confirmed date yet - they only ever get a
  // new_event notification, never date-based reminders.
  startDate?: Date;
  fingerprint: string;
  discoveredAt: Date;
};

export type PersistedEvent = NormalizedEvent & {
  id: string;
};
