import type { BaileysEventMap } from "@whiskeysockets/baileys";
import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { buildWelcomeMessage, pickGoodbyeMessage } from "./idle-content.js";

export type GroupParticipantsUpdate = BaileysEventMap["group-participants.update"];
export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};

export type MembershipListenerOptions = {
  networkingGroups?: string[];
  queue?: QueueServiceLike;
};

export function createNetworkingMembershipListener(
  options: MembershipListenerOptions = {}
): (update: GroupParticipantsUpdate) => Promise<void> {
  const queue = options.queue ?? queueService;

  return async function handleGroupParticipantsUpdate(update: GroupParticipantsUpdate): Promise<void> {
    const networkingGroups = options.networkingGroups ?? getConfiguredWhatsAppGroups().networkingGroups;
    if (!networkingGroups.includes(update.id)) {
      return;
    }

    if (update.action === "add") {
      const participantJids = update.participants.map((participant) => participant.id);
      const { text, mentions } = buildWelcomeMessage(participantJids);
      await queue.enqueue({
        type: "networking",
        destinationGroup: update.id,
        payload: { text, mentions }
      });
      logger.info({ groupJid: update.id, participantJids }, "Networking welcome message queued");
      return;
    }

    if (update.action === "remove") {
      await queue.enqueue({
        type: "networking",
        destinationGroup: update.id,
        payload: { text: pickGoodbyeMessage() }
      });
      logger.info({ groupJid: update.id }, "Networking goodbye message queued");
    }
  };
}
