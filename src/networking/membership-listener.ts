import type { BaileysEventMap } from "@whiskeysockets/baileys";
import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { resolvePhoneJids } from "../shared/mentions.js";
import { whatsapp } from "../whatsapp/client.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { buildWaitlistNoticeMessage, buildWelcomeMessage } from "./idle-content.js";
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
  // How many people are queued to join. Returning 0 (or throwing) simply means no notice.
  countPendingRequests?: (groupJid: string) => Promise<number>;
};

export function createNetworkingMembershipListener(
  options: MembershipListenerOptions = {}
): (update: GroupParticipantsUpdate) => Promise<void> {
  const queue = options.queue ?? queueService;
  const repository = options.repository ?? new NetworkingRepository();
  const countPendingRequests = options.countPendingRequests ?? defaultCountPendingRequests;
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

    // Leaving is never announced with a goodbye - that message was removed on the user's request.
    // Do not reintroduce one here.
    if (update.action === "remove") {
      const participantJids = await resolveParticipantJids(update.participants.map((participant) => participant.id));
      await Promise.all(participantJids.map((jid) => repository.recordMembershipEvent(update.id, jid, "remove")));
      logger.info({ groupJid: update.id }, "Networking membership removal recorded");

      // A departure is the only moment the waiting-list notice makes sense: a seat just opened
      // and there are people queued for it. It used to be posted by the periodic sweep instead,
      // and since its cooldown lived in memory every deploy reset it - the group got the same
      // nudge over and over. Tying it to the event removes the repetition at the source.
      try {
        const pending = await countPendingRequests(update.id);

        if (pending > 0) {
          await queue.enqueue({
            type: "networking",
            destinationGroup: update.id,
            payload: { text: buildWaitlistNoticeMessage(pending) },
            bypassQuietHours: true
          });
          logger.info({ groupJid: update.id, pending }, "Waiting-list notice queued after a departure");
        }
      } catch (error) {
        // Reading the pending list needs admin rights; not having them must not turn a recorded
        // departure into a failure.
        logger.warn({ err: error, groupJid: update.id }, "Could not check the waiting list after a departure");
      }
    }
  };
}

async function defaultCountPendingRequests(groupJid: string): Promise<number> {
  const socket = whatsapp.getSocket();

  if (!socket) {
    return 0;
  }

  // Needs admin rights, same as approving. Without them WhatsApp answers 403 and there is simply
  // no notice - the departure itself is still recorded.
  const requests = await socket.groupRequestParticipantsList(groupJid);
  return requests.length;
}
