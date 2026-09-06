import { jidNormalizedUser, type WAMessage } from "@whiskeysockets/baileys";
import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { pickMentionReply } from "./idle-content.js";
import { NetworkingRepository } from "./networking.repository.js";

export type NetworkingRepositoryLike = Pick<NetworkingRepository, "touchActivity">;
export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};

export type NetworkingMessageListenerOptions = {
  getBotJid: () => string | undefined;
  networkingGroups?: string[];
  repository?: NetworkingRepositoryLike;
  queue?: QueueServiceLike;
};

export function createNetworkingMessageListener(
  options: NetworkingMessageListenerOptions
): (message: WAMessage) => Promise<void> {
  const repository = options.repository ?? new NetworkingRepository();
  const queue = options.queue ?? queueService;

  return async function handleIncomingMessage(message: WAMessage): Promise<void> {
    const remoteJid = message.key?.remoteJid;
    if (!remoteJid) {
      return;
    }

    const networkingGroups = options.networkingGroups ?? getConfiguredWhatsAppGroups().networkingGroups;
    if (!networkingGroups.includes(remoteJid)) {
      return;
    }

    await repository.touchActivity(remoteJid);

    if (message.key?.fromMe) {
      return;
    }

    const botJid = options.getBotJid();
    if (!botJid) {
      return;
    }

    const mentionedJids = message.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    const normalizedBotJid = jidNormalizedUser(botJid);
    const wasMentioned = mentionedJids.some((jid) => jidNormalizedUser(jid) === normalizedBotJid);

    if (!wasMentioned) {
      return;
    }

    const senderJid = message.key?.participant ?? message.key?.remoteJid;
    if (!senderJid) {
      return;
    }

    const reply = pickMentionReply();
    const mentionTag = `@${senderJid.split("@")[0]}`;

    await queue.enqueue({
      type: "networking",
      destinationGroup: remoteJid,
      payload: {
        text: `${mentionTag} ${reply}`,
        mentions: [senderJid]
      },
      priority: 10
    });

    logger.info({ remoteJid, senderJid }, "Networking mention reply queued");
  };
}
