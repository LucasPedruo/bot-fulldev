import type { BaileysEventMap } from "@whiskeysockets/baileys";
import { jidNormalizedUser } from "@whiskeysockets/baileys";
import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { isConfiguredGroup } from "../whatsapp/groups.js";
import { buildGroupIntroduction } from "./group-introduction.js";

export type GroupParticipantsUpdate = BaileysEventMap["group-participants.update"];

export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};

export type GroupIntroductionListenerOptions = {
  // Both the phone-number JID and the LID form of the bot's own identity - which one WhatsApp
  // uses in the participants list depends on the group's addressing mode.
  getBotJids: () => string[];
  queue?: QueueServiceLike;
  isCommunityGroup?: (groupJid: string) => boolean;
};

export function createGroupIntroductionListener(
  options: GroupIntroductionListenerOptions
): (update: GroupParticipantsUpdate) => Promise<void> {
  const queue = options.queue ?? queueService;
  const isCommunityGroup = options.isCommunityGroup ?? isConfiguredGroup;
  // A group can emit the same "add" more than once (a reconnect replays recent events), and the
  // introduction is a one-shot greeting - repeating it would be embarrassing in someone else's
  // group. Kept in memory: the worst case after a restart is one duplicate greeting, which only
  // happens if the bot is re-added to the very same group.
  const introduced = new Set<string>();

  return async function handleGroupParticipantsUpdate(update: GroupParticipantsUpdate): Promise<void> {
    if (update.action !== "add") {
      return;
    }

    const botJids = new Set(options.getBotJids().map(jidNormalizedUser));
    if (botJids.size === 0) {
      return;
    }

    const botWasAdded = update.participants.some((participant) => botJids.has(jidNormalizedUser(participant.id)));
    if (!botWasAdded || introduced.has(update.id)) {
      return;
    }

    introduced.add(update.id);
    const community = isCommunityGroup(update.id);

    await queue.enqueue({
      type: "networking",
      destinationGroup: update.id,
      payload: { text: buildGroupIntroduction({ isCommunityGroup: community }) },
      // A one-off greeting triggered by a human action, in the same spirit as the welcome message
      // for a new member - it would read as strange arriving hours after the bot was added.
      bypassQuietHours: true
    });

    logger.info({ groupJid: update.id, community }, "Group introduction queued");
  };
}
