import type { WAMessage } from "@whiskeysockets/baileys";
import { isBotMentioned, resolvePhoneJid } from "../shared/mentions.js";
import { whatsapp } from "../whatsapp/client.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { ambientEngagementService, type AmbientEngagementService } from "./ambient-engagement.service.js";
import { mentionReplyService, type MentionReplyService } from "./mention-reply.service.js";
import { NetworkingRepository } from "./networking.repository.js";

export type NetworkingRepositoryLike = Pick<NetworkingRepository, "touchActivity">;
export type MentionReplyServiceLike = Pick<MentionReplyService, "handleMention">;
export type AmbientEngagementServiceLike = Pick<AmbientEngagementService, "handleMessage">;

export type NetworkingMessageListenerOptions = {
  // WhatsApp mentions can reference either the phone-number JID (...@s.whatsapp.net) or the
  // newer LID identity (...@lid), depending on the group's addressing mode - both must be
  // supplied so a mention is recognized regardless of which one WhatsApp used.
  getBotJids: () => string[];
  networkingGroups?: string[];
  repository?: NetworkingRepositoryLike;
  mentionService?: MentionReplyServiceLike;
  ambientService?: AmbientEngagementServiceLike;
  // Resolves the sender's JID to its phone-number form before it's used to build an outgoing
  // @mention tag - a LID-based tag renders as plain unlinked text in WhatsApp clients.
  resolveSenderJid?: (jid: string) => Promise<string>;
};

export function createNetworkingMessageListener(
  options: NetworkingMessageListenerOptions
): (message: WAMessage) => Promise<void> {
  const repository = options.repository ?? new NetworkingRepository();
  const mentionService = options.mentionService ?? mentionReplyService;
  const ambientService = options.ambientService ?? ambientEngagementService;
  const resolveSenderJid =
    options.resolveSenderJid ??
    (async (jid: string) => {
      const socket = whatsapp.getSocket();
      return socket ? resolvePhoneJid(jid, socket) : jid;
    });

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
    const messageText = message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? undefined;

    if (!isBotMentioned(mentionedJids, options.getBotJids())) {
      // Ambient participation (reacting/commenting without being mentioned) is a separate, opt-in
      // concern - handleMessage() itself no-ops when NETWORKING_AMBIENT_ENGAGEMENT_ENABLED is off,
      // so this is always safe to call here.
      if (message.key) {
        await ambientService.handleMessage(remoteJid, message.key, messageText);
      }
      return;
    }

    const rawSenderJid = message.key?.participant ?? message.key?.remoteJid;
    if (!rawSenderJid) {
      return;
    }

    const senderJid = await resolveSenderJid(rawSenderJid);
    await mentionService.handleMention(remoteJid, senderJid, messageText);
  };
}
