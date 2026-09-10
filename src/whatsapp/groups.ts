import { env } from "../config/env.js";

export type ConfiguredWhatsAppGroups = {
  jobsGroup1: string;
  jobsGroup2: string;
  // The college/university jobs group - shares every job posting with jobsGroup1/2, but each
  // message gets an extra line inviting people to check out the FullDev community.
  facultyJobsGroup: string;
  eventsGroup: string;
  networkingGroup: string;
  networkingGroup1: string;
  networkingGroup2: string;
  networkingGroups: string[];
  // Source of the faculty relay: the group where the course representatives and the professors
  // announce events. The bot only reads here, it never posts.
  eixoRepresentativesGroup: string;
  // Destination of the faculty relay: the "Eventos e oportunidades" group inside the college
  // community, which receives the summarized announcements.
  facultyEventsGroup: string;
};

export function getConfiguredWhatsAppGroups(): ConfiguredWhatsAppGroups {
  const networkingGroup1 = env.WHATSAPP_NETWORKING_GROUP_1 || env.WHATSAPP_NETWORKING_GROUP;
  const networkingGroup2 = env.WHATSAPP_NETWORKING_GROUP_2;

  return {
    jobsGroup1: env.WHATSAPP_JOBS_GROUP_1,
    jobsGroup2: env.WHATSAPP_JOBS_GROUP_2,
    facultyJobsGroup: env.WHATSAPP_FACULTY_JOBS_GROUP,
    eventsGroup: env.WHATSAPP_EVENTS_GROUP,
    networkingGroup: networkingGroup1,
    networkingGroup1,
    networkingGroup2,
    networkingGroups: [networkingGroup1, networkingGroup2].filter((jid) => jid.length > 0),
    eixoRepresentativesGroup: env.WHATSAPP_EIXO_REPRESENTATIVES_GROUP,
    facultyEventsGroup: env.WHATSAPP_FACULTY_EVENTS_GROUP
  };
}

// Every group the bot is deliberately configured to operate in. Two features depend on this: the
// release announcement (which groups hear about an update) and the self-introduction (a group in
// this list belongs to the FullDev/college community, so it gets the short greeting instead of the
// full "who I am and what FullDev is" pitch).
export function getAllConfiguredGroupJids(): string[] {
  const groups = getConfiguredWhatsAppGroups();

  return unique(
    [
      groups.jobsGroup1,
      groups.jobsGroup2,
      groups.facultyJobsGroup,
      groups.eventsGroup,
      groups.networkingGroup1,
      groups.networkingGroup2,
      groups.eixoRepresentativesGroup,
      groups.facultyEventsGroup
    ].filter((jid) => jid.length > 0)
  );
}

export function isConfiguredGroup(groupJid: string): boolean {
  return getAllConfiguredGroupJids().includes(groupJid);
}

function unique(jids: string[]): string[] {
  return [...new Set(jids)];
}
