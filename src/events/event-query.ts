import { monthIndexByName, normalizePart } from "./event.normalizer.js";

export type EventQuery = {
  month?: number;
  year?: number;
  location?: string;
};

// Detecting the question doesn't require the bot to be mentioned - it fires on any message in the
// Events group that looks like someone asking about events, per explicit user instruction. Kept
// deliberately narrow (must mention "evento(s)" plus a question marker) to avoid false positives on
// casual chat that happens to use the word "evento".
const questionWordPattern = /\b(tem|algum|alguma|quais|qual|quando|onde|cade|sabe|existe|havera|vai)\b/;
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

export function isEventQuestion(text: string): boolean {
  const normalized = normalizePart(text);
  if (!/\bevento/.test(normalized)) {
    return false;
  }

  return normalized.includes("?") || questionWordPattern.test(normalized);
}

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

export function parseEventQuery(text: string, referenceDate: Date = new Date()): EventQuery | undefined {
  if (!isEventQuestion(text)) {
    return undefined;
  }

  const monthMatch = extractMonth(text, referenceDate);
  const textWithoutMonth = text.replace(monthNamePattern, " ");
  const location = extractLocation(textWithoutMonth);

  return { month: monthMatch?.month, year: monthMatch?.year, location };
}

function resolveYear(month: number, referenceDate: Date): number {
  const currentYear = referenceDate.getFullYear();
  return month < referenceDate.getMonth() ? currentYear + 1 : currentYear;
}
