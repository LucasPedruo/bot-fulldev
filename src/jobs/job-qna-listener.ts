import type { WAMessage } from "@whiskeysockets/baileys";
import { isBotMentioned } from "../shared/mentions.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { jobQnaService, type JobQnaService } from "./job-qna.service.js";

export type JobQnaServiceLike = Pick<JobQnaService, "handleMessage">;

export type JobQnaListenerOptions = {
  // Same LID-vs-phone-number JID caveat as the other mention listeners - both must be supplied so
  // a mention is recognized regardless of which one WhatsApp used.
  getBotJids: () => string[];
  jobsGroups?: string[];
  service?: JobQnaServiceLike;
};

// Requires an explicit @-mention of the bot, same reasoning as the events Q&A: answering any
// message that merely looks like a question about jobs would false-trigger on unrelated chat.
export function createJobQnaListener(options: JobQnaListenerOptions): (message: WAMessage) => Promise<void> {
  const service = options.service ?? jobQnaService;

  return async function handleIncomingMessage(message: WAMessage): Promise<void> {
    if (message.key?.fromMe) {
      return;
    }

    const remoteJid = message.key?.remoteJid;
    if (!remoteJid) {
      return;
    }

    const jobsGroups = options.jobsGroups ?? [getConfiguredWhatsAppGroups().jobsGroup1, getConfiguredWhatsAppGroups().jobsGroup2].filter(Boolean);
    if (!jobsGroups.includes(remoteJid)) {
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
