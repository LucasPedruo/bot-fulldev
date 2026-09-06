import type { WAMessage } from "@whiskeysockets/baileys";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { eventQnaService, type EventQnaService } from "./event-qna.service.js";

export type EventQnaServiceLike = Pick<EventQnaService, "handleMessage">;

export type EventQnaListenerOptions = {
  eventsGroup?: string;
  service?: EventQnaServiceLike;
};

// No @mention required, per explicit user instruction - any message in the Events group that
// looks like a question about events (month or location) gets answered. Detection itself lives in
// event-query.ts and stays conservative enough to skip plain chat.
export function createEventQnaListener(options: EventQnaListenerOptions = {}): (message: WAMessage) => Promise<void> {
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

    const text = message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? "";
    if (!text) {
      return;
    }

    await service.handleMessage(remoteJid, text);
  };
}
