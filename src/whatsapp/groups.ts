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
    networkingGroups: [networkingGroup1, networkingGroup2].filter((jid) => jid.length > 0)
  };
}
