import { formatJobMessage } from "../job.formatter.js";
import { JobicyProvider } from "../providers/jobicy.provider.js";
import { RemotiveProvider } from "../providers/remotive.provider.js";

const providerArg = process.argv.find((arg) => arg.startsWith("--provider="));
const providerName = providerArg?.split("=")[1] ?? "jobicy";

if (process.argv.includes("--dry-run")) {
  const provider = providerName === "remotive" ? new RemotiveProvider() : new JobicyProvider();
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
