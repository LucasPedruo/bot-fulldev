import { env } from "../config/env.js";

export function isQuietHours(date: Date, start = env.QUIET_HOURS_START, end = env.QUIET_HOURS_END): boolean {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  const current = date.getHours() * 60 + date.getMinutes();

  if (startMinutes === endMinutes) {
    return false;
  }

  if (startMinutes < endMinutes) {
    return current >= startMinutes && current < endMinutes;
  }

  return current >= startMinutes || current < endMinutes;
}

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}
