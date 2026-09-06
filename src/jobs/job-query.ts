import { inferCategory, inferLevel, normalizeForMatch } from "./job.normalizer.js";
import type { JobCategory, JobLevel } from "./job.types.js";

export type JobQuery = {
  level?: JobLevel;
  category?: JobCategory;
};

// Reuses the exact same keyword inference used to classify job postings themselves
// (inferLevel/inferCategory), since the signal words are the same either way ("junior",
// "frontend", etc). inferCategory always returns a category, defaulting to "other" when nothing
// matched - that default means "no category detected", not "filter for other", so it's dropped.
export function parseJobQuery(text: string): JobQuery {
  // inferCategory's data/AI pattern includes a bare "ai" (as in the English acronym), which never
  // collides with a real job title but constantly does with casual chat ("e aí, tem vaga?" ->
  // "aí" loses its accent on normalization and becomes "ai"). Strip that specific interjection
  // before inferring - multi-word AI signals ("machine learning", "inteligencia artificial")
  // aren't affected since they don't rely on the bare token.
  const withoutInterjection = normalizeForMatch(text).replace(/\bai\b/g, " ");
  const category = inferCategory(withoutInterjection);

  return {
    level: inferLevel(text),
    category: category === "other" ? undefined : category
  };
}
