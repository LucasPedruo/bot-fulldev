import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { buildGroupIntroduction, resolveGroupRole } from "./group-introduction.js";
import { introductionRepository, type IntroductionRepository } from "./introduction.repository.js";

export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};

export type IntroductionBackfillOptions = {
  groups?: string[];
  queue?: QueueServiceLike;
  repository?: Pick<IntroductionRepository, "getIntroducedGroups" | "markIntroduced">;
};

// The join listener only fires when the bot is added while it is online, so a group it was
// already in when the feature shipped never hears anything. This runs once on boot and covers
// exactly the groups named below.
//
// Deliberately NOT every configured group: the bot has been in the FullDev groups for a long
// time and an unprompted introduction to 1024 people would read as noise. The faculty groups are
// different - people there have no idea what it is or, more importantly, that what they post is
// being forwarded.
function defaultBackfillGroups(): string[] {
  const groups = getConfiguredWhatsAppGroups();
  return [groups.eixoRepresentativesGroup, groups.facultyEventsGroup].filter((jid) => jid.length > 0);
}

export class IntroductionBackfillService {
  constructor(private readonly options: IntroductionBackfillOptions = {}) {}

  async run(): Promise<string[]> {
    const targets = this.options.groups ?? defaultBackfillGroups();

    if (targets.length === 0) {
      return [];
    }

    const repository = this.options.repository ?? introductionRepository;
    const queue = this.options.queue ?? queueService;
    const alreadyIntroduced = new Set(await repository.getIntroducedGroups());
    const introduced: string[] = [];

    for (const groupJid of targets) {
      if (alreadyIntroduced.has(groupJid)) {
        continue;
      }

      const role = resolveGroupRole(groupJid);

      await queue.enqueue({
        type: "networking",
        destinationGroup: groupJid,
        payload: { text: buildGroupIntroduction(role) }
        // Quiet hours apply: this is a backfill running on a deploy, not a reaction to anyone,
        // so there is no reason for it to land at 3am.
      });

      // Marked per group right after its own enqueue, so a failure halfway through does not
      // re-send to the groups already covered on the next boot.
      await repository.markIntroduced(groupJid);
      introduced.push(groupJid);
      logger.info({ groupJid, role }, "Group introduction backfilled");
    }

    return introduced;
  }
}

export const introductionBackfillService = new IntroductionBackfillService();
