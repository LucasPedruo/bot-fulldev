import { monthIndexByName, normalizePart } from "./event.normalizer.js";

export type EventQuery = {
  month?: number;
  year?: number;
  location?: string;
};

const monthNamePattern = /\b(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i;
// Best-effort, same spirit as the Luma title filter - captures the phrase after a location
// preposition, then trims filler words off both ends. Won't handle every phrasing correctly.
const locationPrepositionPattern = /\b(?:em|no|na|nos|nas)\s+([a-zà-úA-ZÀ-Ú][a-zà-úA-ZÀ-Ú\s]{1,40})/;
const locationNoiseWords = new Set([
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "de",
  "do",
  "da",
  "dos",
  "das",
  "mes",
  "esse",
  "nesse",
  "este",
  "essa",
  "nessa",
  "algum",
  "alguma",
  "tem",
  "ai",
  "la",
  "proximo",
  "que",
  "vem"
]);

export function extractMonth(text: string, referenceDate: Date): { month: number; year: number } | undefined {
  const normalized = normalizePart(text);

  for (const [word, month] of Object.entries(monthIndexByName)) {
    if (new RegExp(`\\b${word}\\b`).test(normalized)) {
      return { month, year: resolveYear(month, referenceDate) };
    }
  }

  return undefined;
}

export function extractLocation(text: string): string | undefined {
  const match = locationPrepositionPattern.exec(text);
  if (!match) {
    return undefined;
  }

  const words = match[1].trim().split(/\s+/);

  while (words.length > 0 && locationNoiseWords.has(normalizePart(words[0]))) {
    words.shift();
  }

  while (words.length > 0 && locationNoiseWords.has(normalizePart(words[words.length - 1]))) {
    words.pop();
  }

  if (words.length === 0) {
    return undefined;
  }

  const candidate = words.join(" ");
  // A bare month name ("em setembro") is not a location - extractMonth already handles it.
  if (Object.prototype.hasOwnProperty.call(monthIndexByName, normalizePart(candidate))) {
    return undefined;
  }

  return candidate;
}

// The bot only ever calls this once it's already been @-mentioned in the Events group (see
// event-qna-listener.ts), so there's no separate "does this look like a question" gate here -
// any mention is treated as an event question, and this just extracts whatever criteria it can.
export function parseEventQuery(text: string, referenceDate: Date = new Date()): EventQuery {
  const monthMatch = extractMonth(text, referenceDate);
  const textWithoutMonth = text.replace(monthNamePattern, " ");
  const location = extractLocation(textWithoutMonth);

  return { month: monthMatch?.month, year: monthMatch?.year, location };
}

function resolveYear(month: number, referenceDate: Date): number {
  const currentYear = referenceDate.getFullYear();
  return month < referenceDate.getMonth() ? currentYear + 1 : currentYear;
}
