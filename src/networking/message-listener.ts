import type { WAMessage } from "@whiskeysockets/baileys";
import { isBotMentioned } from "../shared/mentions.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { mentionReplyService, type MentionReplyService } from "./mention-reply.service.js";
import { NetworkingRepository } from "./networking.repository.js";

export type NetworkingRepositoryLike = Pick<NetworkingRepository, "touchActivity">;
export type MentionReplyServiceLike = Pick<MentionReplyService, "handleMention">;

export type NetworkingMessageListenerOptions = {
  // WhatsApp mentions can reference either the phone-number JID (...@s.whatsapp.net) or the
  // newer LID identity (...@lid), depending on the group's addressing mode - both must be
  // supplied so a mention is recognized regardless of which one WhatsApp used.
  getBotJids: () => string[];
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

    const mentionedJids = message.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (!isBotMentioned(mentionedJids, options.getBotJids())) {
      return;
    }

    const senderJid = message.key?.participant ?? message.key?.remoteJid;
    if (!senderJid) {
      return;
    }

    const messageText = message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? undefined;
    await mentionService.handleMention(remoteJid, senderJid, messageText);
  };
}
