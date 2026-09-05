import { createHash } from "node:crypto";
import type { JobCategory, JobLevel } from "./job.types.js";

const technologyPatterns: Array<[string, RegExp]> = [
  ["React", /\breact(?:\.js)?\b/i],
  ["TypeScript", /\btypescript\b|\bts\b/i],
  ["JavaScript", /\bjavascript\b|(?<!\.)\bjs\b/i],
  ["Node.js", /\bnode(?:\.js)?\b/i],
  ["Next.js", /\bnext(?:\.js)?\b/i],
  ["Vue", /\bvue(?:\.js)?\b/i],
  ["Angular", /\bangular\b/i],
  ["Python", /\bpython\b/i],
  ["Java", /\bjava\b/i],
  ["Go", /\bgolang\b|\bgo\b/i],
  ["PHP", /\bphp\b/i],
  ["Ruby", /\bruby\b|\brails\b/i],
  ["AWS", /\baws\b|amazon web services/i],
  ["Docker", /\bdocker\b/i],
  ["Kubernetes", /\bkubernetes\b|\bk8s\b/i],
  ["PostgreSQL", /\bpostgres(?:ql)?\b/i],
  ["SQL", /\bsql\b/i],
  ["GraphQL", /\bgraphql\b/i],
  ["Flutter", /\bflutter\b/i],
  ["React Native", /react native/i]
];

export function normalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];

  for (const param of trackingParams) {
    url.searchParams.delete(param);
  }

  url.hash = "";
  return url.toString();
}

export function createJobFingerprint(input: { company: string; title: string; url: string }): string {
  const normalized = [input.company, input.title, normalizeUrl(input.url)].map(normalizeFingerprintPart).join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

export function inferLevel(value: string): JobLevel | undefined {
  const text = normalizeForMatch(value);

  if (/\bintern\b|estagi|trainee/.test(text)) {
    return "intern";
  }

  if (/\bjunior\b|\bjr\b|entry level/.test(text)) {
    return "junior";
  }

  if (/\bsenior\b|\bsr\b|lead|principal|staff/.test(text)) {
    return "senior";
  }

  if (/\bmid\b|pleno|pl\b|middle/.test(text)) {
    return "mid";
  }

  return undefined;
}

export function inferCategory(value: string): JobCategory {
  const text = normalizeForMatch(value);

  if (/\bqa\b|quality assurance|quality|tester|testador|test automation|analista de qualidade|automacao de (teste|software)/.test(text)) {
    return "qa";
  }

  if (/fullstack|full stack/.test(text)) {
    return "fullstack";
  }

  if (/\bmobile\b|\bandroid\b|\bios\b|flutter|react native/.test(text)) {
    return "mobile";
  }

  if (/\bdata\b|dados|analytics|machine learning|ml\b|ai\b|artificial intelligence|inteligencia artificial|scientist|cientista/.test(text)) {
    return "data";
  }

  if (/front[\s-]?end|frontend|react|vue|angular|css|ui engineer/.test(text)) {
    return "frontend";
  }

  if (/back[\s-]?end|backend|api|server|node|java|python|golang|php|ruby/.test(text)) {
    return "backend";
  }

  if (/devops|sre|platform|cloud|aws|kubernetes|docker|infrastructure/.test(text)) {
    return "devops";
  }

  if (/design|designer|product designer|ux|ui\/ux/.test(text)) {
    return "design";
  }

  return "other";
}

export function extractTechnologies(value: string): string[] {
  const found = technologyPatterns.filter(([, pattern]) => pattern.test(value)).map(([technology]) => technology);
  return [...new Set(found)].slice(0, 6);
}

function normalizeFingerprintPart(value: string): string {
  return normalizeForMatch(value).replace(/\s+/g, " ").trim();
}

export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
