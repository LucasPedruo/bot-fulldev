import type { NormalizedJob } from "./job.types.js";

const categoryLabels: Record<NormalizedJob["category"], string> = {
  frontend: "Front-end",
  backend: "Back-end",
  fullstack: "Full stack",
  mobile: "Mobile",
  devops: "DevOps",
  data: "Dados",
  qa: "QA",
  design: "Design",
  other: "Tecnologia"
};

const levelLabels: Record<NonNullable<NormalizedJob["level"]>, string> = {
  intern: "Estagio",
  junior: "Junior",
  mid: "Pleno",
  senior: "Senior"
};

export function formatJobMessage(job: NormalizedJob): string {
  const lines = ["Nova vaga", "", job.title, "", job.company, "Remoto"];

  if (job.location) {
    lines.push(job.location);
  }

  if (job.technologies.length > 0) {
    lines.push(job.technologies.join(" · "));
  }

  if (job.level) {
    lines.push(levelLabels[job.level]);
  }

  lines.push(categoryLabels[job.category], "", "Candidatar:", job.url, "", `Fonte: ${job.source}`);

  return lines.join("\n");
}
