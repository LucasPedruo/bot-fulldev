import { createHash } from "node:crypto";

// Aggregators like Luma mix every kind of community event into the same feed (fashion, finance,
// documentary launches alongside real tech meetups), unlike a job board where the title is
// inherently about the role. This is a best-effort filter, not exhaustive - titles are branded event
// names ("GambiConf", "Hacktown") that don't always contain an obvious keyword, so some legitimate
// tech events are missed and that's an accepted tradeoff over posting off-topic events to the group.
const techEventKeywords = new RegExp(
  "\\btech\\b|tecnologia|\\bdev\\b|desenvolv|programa[cç][aã]o|programador|software|\\bcode\\b|c[oó]digo|hack(at(h|w)on)?|startup|\\bia\\b|\\bai\\b|intelig[eê]ncia artificial|machine learning|\\bml\\b|data science|ci[eê]ncia de dados|\\bcloud\\b|\\bnuvem\\b|seguran[cç]a da informa[cç][aã]o|cybersecurity|cyber seguranca|blockchain|web3|frontend|front-end|backend|back-end|full[\\s-]?stack|\\bapi\\b|\\bsaas\\b|\\bux\\b|\\bui\\b|product manager|gest[aã]o de produto|meetup|devfest|jsconf|pyconf|\\btdc\\b",
  "i"
);

export function isTechEventTitle(title: string): boolean {
  return techEventKeywords.test(normalizePart(title));
}

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
