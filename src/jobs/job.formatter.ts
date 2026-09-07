import type { JobQuery } from "./job-query.js";
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
  const lines = ["Nova vaga", "", job.title, "", job.company];

  if (job.remote) {
    lines.push("Remoto");
  }

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

// Same job facts as formatJobMessage - every group gets the identical posting - plus an extra
// line inviting the college group specifically to check out the FullDev community.
const FACULTY_COMMUNITY_INVITE = "🚀 Quer trocar ideia com outros devs, indicações de vaga e conteúdo todo dia? Conheça a comunidade FullDev: https://fulldev.com.br";

export function formatJobMessageForFaculty(job: NormalizedJob): string {
  return `${formatJobMessage(job)}\n\n${FACULTY_COMMUNITY_INVITE}`;
}

export function formatJobQueryReply(jobs: NormalizedJob[], query: JobQuery): string {
  if (jobs.length === 0) {
    return describeNoMatchMessage(query);
  }

  const lines = [describeQueryHeading(query), ""];

  jobs.forEach((job, index) => {
    if (index > 0) {
      lines.push("");
    }

    lines.push(`${index + 1}. ${job.title} — ${job.company}`);
    lines.push(job.level ? `${levelLabels[job.level]} · ${categoryLabels[job.category]}` : categoryLabels[job.category]);
    lines.push(job.url);
  });

  return lines.join("\n");
}

function describeQueryHeading(query: JobQuery): string {
  if (query.level && query.category) {
    return `Vagas de ${categoryLabels[query.category]} nível ${levelLabels[query.level]}:`;
  }

  if (query.level) {
    return `Vagas nível ${levelLabels[query.level]}:`;
  }

  if (query.category) {
    return `Vagas de ${categoryLabels[query.category]}:`;
  }

  return "Vagas recentes:";
}

function describeNoMatchMessage(query: JobQuery): string {
  if (query.level && query.category) {
    return `Não encontrei nenhuma vaga de ${categoryLabels[query.category]} nível ${levelLabels[query.level]}.`;
  }

  if (query.level) {
    return `Não encontrei nenhuma vaga nível ${levelLabels[query.level]}.`;
  }

  if (query.category) {
    return `Não encontrei nenhuma vaga de ${categoryLabels[query.category]}.`;
  }

  return "Não encontrei nenhuma vaga registrada até agora.";
}
