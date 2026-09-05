export const jobLevels = ["intern", "junior", "mid", "senior"] as const;
export type JobLevel = (typeof jobLevels)[number];

export const jobCategories = ["frontend", "backend", "fullstack", "mobile", "devops", "data", "qa", "design", "other"] as const;
export type JobCategory = (typeof jobCategories)[number];

export type NormalizedJob = {
  id?: string;
  externalId: string;
  source: string;
  title: string;
  company: string;
  location?: string;
  remote: boolean;
  level?: JobLevel;
  category: JobCategory;
  technologies: string[];
  url: string;
  fingerprint: string;
  publishedAt?: Date;
  discoveredAt: Date;
};

export type PersistedJob = NormalizedJob & {
  id: string;
};
