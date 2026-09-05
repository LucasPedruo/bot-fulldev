import { DEFAULT_TIMEZONE } from "../config/constants.js";

export function nowUtc(): Date {
  return new Date();
}

export function formatDateTimeForTimezone(date: Date, timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone
  }).format(date);
}
