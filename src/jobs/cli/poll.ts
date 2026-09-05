import { formatJobMessage } from "../job.formatter.js";
import { ArbeitnowProvider } from "../providers/arbeitnow.provider.js";
import { JobicyProvider } from "../providers/jobicy.provider.js";
import { RemoteokProvider } from "../providers/remoteok.provider.js";
import { RemotiveProvider } from "../providers/remotive.provider.js";
import type { JobProvider } from "../providers/provider.interface.js";

const providerArg = process.argv.find((arg) => arg.startsWith("--provider="));
const providerName = providerArg?.split("=")[1] ?? "jobicy";

const providersByName: Record<string, () => JobProvider> = {
  jobicy: () => new JobicyProvider(),
  remotive: () => new RemotiveProvider(),
  remoteok: () => new RemoteokProvider(),
  arbeitnow: () => new ArbeitnowProvider()
};

if (process.argv.includes("--dry-run")) {
  const provider = (providersByName[providerName] ?? providersByName.jobicy)();
  const jobs = await provider.fetchJobs();
  console.log({
    provider: provider.name,
    fetched: jobs.length,
    sample: jobs.slice(0, 3).map((job) => ({
      externalId: job.externalId,
      title: job.title,
      company: job.company,
      category: job.category,
      level: job.level,
      technologies: job.technologies,
      url: job.url
    }))
  });

  if (jobs[0]) {
    console.log("\nSample WhatsApp message:\n");
    console.log(formatJobMessage(jobs[0]));
  }
} else {
  const { jobService } = await import("../job.service.js");
  const result = await jobService.poll();
  console.log(result);
}
