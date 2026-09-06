import { createHash } from "node:crypto";

export function createEventFingerprint(input: { title: string; url: string; startDate?: Date }): string {
  const normalized = [normalizePart(input.title), normalizePart(input.url), input.startDate?.toISOString() ?? "tba"].join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
