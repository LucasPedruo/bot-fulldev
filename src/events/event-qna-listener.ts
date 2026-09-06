import type { WAMessage } from "@whiskeysockets/baileys";
import { isBotMentioned } from "../shared/mentions.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { eventQnaService, type EventQnaService } from "./event-qna.service.js";

export type EventQnaServiceLike = Pick<EventQnaService, "handleMessage">;

export type EventQnaListenerOptions = {
  // Same LID-vs-phone-number JID caveat as the networking mention listener - both must be
  // supplied so a mention is recognized regardless of which one WhatsApp used.
  getBotJids: () => string[];
  eventsGroup?: string;
  service?: EventQnaServiceLike;
};

// Requires an explicit @-mention of the bot - an earlier version answered any message that merely
// looked like a question, which false-triggered on unrelated chat that happened to contain
// "evento" and a question mark.
export function createEventQnaListener(options: EventQnaListenerOptions): (message: WAMessage) => Promise<void> {
  const service = options.service ?? eventQnaService;

  return async function handleIncomingMessage(message: WAMessage): Promise<void> {
    if (message.key?.fromMe) {
      return;
    }

    const remoteJid = message.key?.remoteJid;
    if (!remoteJid) {
      return;
    }

    const eventsGroup = options.eventsGroup ?? getConfiguredWhatsAppGroups().eventsGroup;
    if (!eventsGroup || remoteJid !== eventsGroup) {
      return;
    }

    const mentionedJids = message.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (!isBotMentioned(mentionedJids, options.getBotJids())) {
      return;
    }

    const text = message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? "";
    if (!text) {
      return;
    }

    await service.handleMessage(remoteJid, text);
  };
}
