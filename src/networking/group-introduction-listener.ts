import type { BaileysEventMap } from "@whiskeysockets/baileys";
import { jidNormalizedUser } from "@whiskeysockets/baileys";
import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { buildGroupIntroduction, resolveGroupRole, type GroupRole } from "./group-introduction.js";
import { introductionRepository, type IntroductionRepository } from "./introduction.repository.js";

export type GroupParticipantsUpdate = BaileysEventMap["group-participants.update"];

export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};

export type GroupIntroductionListenerOptions = {
  // Both the phone-number JID and the LID form of the bot's own identity - which one WhatsApp
  // uses in the participants list depends on the group's addressing mode.
  getBotJids: () => string[];
  queue?: QueueServiceLike;
  repository?: Pick<IntroductionRepository, "getIntroducedGroups" | "markIntroduced">;
  resolveRole?: (groupJid: string) => GroupRole;
};

export function createGroupIntroductionListener(
  options: GroupIntroductionListenerOptions
): (update: GroupParticipantsUpdate) => Promise<void> {
  const queue = options.queue ?? queueService;
  const repository = options.repository ?? introductionRepository;
  const resolveRole = options.resolveRole ?? resolveGroupRole;

  return async function handleGroupParticipantsUpdate(update: GroupParticipantsUpdate): Promise<void> {
    if (update.action !== "add") {
      return;
    }

    const botJids = new Set(options.getBotJids().map(jidNormalizedUser));
    if (botJids.size === 0) {
      return;
    }

    const botWasAdded = update.participants.some((participant) => botJids.has(jidNormalizedUser(participant.id)));
    if (!botWasAdded) {
      return;
    }

    try {
      // Persisted rather than kept in memory: a reconnect replays recent events and a deploy
      // wipes any in-process set, so both would make the bot greet the same group twice.
      const introduced = await repository.getIntroducedGroups();
      if (introduced.includes(update.id)) {
        return;
      }

      const role = resolveRole(update.id);

      await queue.enqueue({
        type: "networking",
        destinationGroup: update.id,
        payload: { text: buildGroupIntroduction(role) },
        // A one-off greeting triggered by a human action, in the same spirit as the welcome
        // message for a new member - it would read as strange arriving hours after the fact.
        bypassQuietHours: true
      });

      await repository.markIntroduced(update.id);
      logger.info({ groupJid: update.id, role }, "Group introduction queued");
    } catch (error) {
      logger.error({ err: error, groupJid: update.id }, "Failed to introduce the bot in the group");
    }
  };
}
