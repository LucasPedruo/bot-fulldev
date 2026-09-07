import type { BaileysEventMap } from "@whiskeysockets/baileys";
import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { resolvePhoneJids } from "../shared/mentions.js";
import { whatsapp } from "../whatsapp/client.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { buildWelcomeMessage, pickGoodbyeMessage } from "./idle-content.js";
import { NetworkingRepository } from "./networking.repository.js";

export type GroupParticipantsUpdate = BaileysEventMap["group-participants.update"];
export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};
export type NetworkingRepositoryLike = Pick<NetworkingRepository, "recordMembershipEvent">;

export type MembershipListenerOptions = {
  networkingGroups?: string[];
  queue?: QueueServiceLike;
  repository?: NetworkingRepositoryLike;
  // Resolves participant JIDs to their phone-number form before building the welcome @mentions -
  // a LID-based tag renders as plain unlinked text in WhatsApp clients.
  resolveParticipantJids?: (jids: string[]) => Promise<string[]>;
};

export function createNetworkingMembershipListener(
  options: MembershipListenerOptions = {}
): (update: GroupParticipantsUpdate) => Promise<void> {
  const queue = options.queue ?? queueService;
  const repository = options.repository ?? new NetworkingRepository();
  const resolveParticipantJids =
    options.resolveParticipantJids ??
    (async (jids: string[]) => {
      const socket = whatsapp.getSocket();
      return socket ? resolvePhoneJids(jids, socket) : jids;
    });

  return async function handleGroupParticipantsUpdate(update: GroupParticipantsUpdate): Promise<void> {
    const networkingGroups = options.networkingGroups ?? getConfiguredWhatsAppGroups().networkingGroups;
    if (!networkingGroups.includes(update.id)) {
      return;
    }

    if (update.action === "add") {
      const participantJids = await resolveParticipantJids(update.participants.map((participant) => participant.id));
      await Promise.all(participantJids.map((jid) => repository.recordMembershipEvent(update.id, jid, "add")));

      const { text, mentions } = buildWelcomeMessage(participantJids);
      await queue.enqueue({
        type: "networking",
        destinationGroup: update.id,
        payload: { text, mentions },
        // Join/leave events are low-frequency and reactive, not spam-prone like idle topics or
        // job posts, so the user asked for these specifically to skip the quiet-hours block.
        bypassQuietHours: true
      });
      logger.info({ groupJid: update.id, participantJids }, "Networking welcome message queued");
      return;
    }

    if (update.action === "remove") {
      const participantJids = await resolveParticipantJids(update.participants.map((participant) => participant.id));
      await Promise.all(participantJids.map((jid) => repository.recordMembershipEvent(update.id, jid, "remove")));

      await queue.enqueue({
        type: "networking",
        destinationGroup: update.id,
        payload: { text: pickGoodbyeMessage() },
        bypassQuietHours: true
      });
      logger.info({ groupJid: update.id }, "Networking goodbye message queued");
    }
  };
}
