import { jidNormalizedUser, type WAMessage } from "@whiskeysockets/baileys";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { mentionReplyService, type MentionReplyService } from "./mention-reply.service.js";
import { NetworkingRepository } from "./networking.repository.js";

export type NetworkingRepositoryLike = Pick<NetworkingRepository, "touchActivity">;
export type MentionReplyServiceLike = Pick<MentionReplyService, "handleMention">;

export type NetworkingMessageListenerOptions = {
  getBotJid: () => string | undefined;
  networkingGroups?: string[];
  repository?: NetworkingRepositoryLike;
  mentionService?: MentionReplyServiceLike;
};

export function createNetworkingMessageListener(
  options: NetworkingMessageListenerOptions
): (message: WAMessage) => Promise<void> {
  const repository = options.repository ?? new NetworkingRepository();
  const mentionService = options.mentionService ?? mentionReplyService;

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

    await mentionService.handleMention(remoteJid, senderJid);
  };
}
