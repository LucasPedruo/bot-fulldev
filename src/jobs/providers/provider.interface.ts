import type { NormalizedJob } from "../job.types.js";

export interface JobProvider {
  name: string;
  fetchJobs(): Promise<NormalizedJob[]>;
}
