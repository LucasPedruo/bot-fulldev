import type { WAMessage, WAMessageKey } from "@whiskeysockets/baileys";
import { describeImage } from "../accessibility/image-description.provider.js";
import { findDescribableMedia } from "../accessibility/image-description-listener.js";
import { createAdminChecker } from "../faculty/faculty-relay-listener.js";
import { logger } from "../shared/logger.js";
import { downloadMedia } from "../shared/media.js";
import { extractMessageText } from "../shared/messages.js";
import { whatsapp } from "../whatsapp/client.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { classifyJobsGroupMessage } from "./moderation.classifier.js";
import { moderationService, type ModerationActions, type ModerationService } from "./moderation.service.js";

export type ModerationListenerOptions = {
  jobsGroups?: string[];
  service?: Pick<ModerationService, "punish">;
  classify?: (text: string, imageDescription?: string) => Promise<{ allowed: boolean; reason: string }>;
  isGroupAdmin?: (groupJid: string, senderJid: string) => Promise<boolean>;
  describeMedia?: (message: WAMessage) => Promise<string | undefined>;
};

export function getModeratedJobsGroups(): string[] {
  const groups = getConfiguredWhatsAppGroups();
  return [groups.jobsGroup1, groups.jobsGroup2, groups.facultyJobsGroup].filter((jid) => jid.length > 0);
}

export function createJobsModerationListener(
  options: ModerationListenerOptions = {}
): (message: WAMessage) => Promise<void> {
  const service = options.service ?? moderationService;
  const classify = options.classify ?? classifyJobsGroupMessage;
  const isGroupAdmin = options.isGroupAdmin ?? createAdminChecker();
  const describeMedia = options.describeMedia ?? defaultDescribeMedia;

  return async function handleIncomingMessage(message: WAMessage): Promise<void> {
    const groupJid = message.key?.remoteJid;
    const jobsGroups = options.jobsGroups ?? getModeratedJobsGroups();

    if (!groupJid || !jobsGroups.includes(groupJid) || message.key.fromMe) {
      return;
    }

    const senderJid = message.key.participant;
    if (!senderJid) {
      return;
    }

    try {
      // Admins are exempt, as asked. Checked before anything else so a moderator posting a
      // reminder or answering someone is never touched.
      if (await isGroupAdmin(groupJid, senderJid)) {
        return;
      }
    } catch (error) {
      // If the membership cannot be read we cannot tell an admin from a member, and acting
      // blindly could delete a moderator's message. Doing nothing is the safe failure.
      logger.warn({ err: error, groupJid }, "Could not verify admin status - skipping moderation");
      return;
    }

    const text = extractMessageText(message) ?? "";
    const media = findDescribableMedia(message);

    // A sticker is never a job posting and never a request to filter vacancies, so it is
    // off-topic by construction - no classifier needed. This is decided BEFORE any download,
    // because the previous version asked for a description first and silently gave up when that
    // failed: a sticker slipped through the jobs group in production exactly that way, since the
    // media host in its proto no longer resolves and the vision model rejects animated WebP.
    if (media?.isSticker) {
      await service.punish({
        groupJid,
        participantJid: senderJid,
        messageKey: message.key,
        reason: "figurinha"
      });
      return;
    }

    // A job posted as a flyer carries no text. Judging it on the text alone would delete a valid
    // posting for being empty, so the image is described first and fed to the classifier.
    const imageDescription = await describeMedia(message);

    if (text.trim().length === 0) {
      // An image we could not describe is genuinely unjudgeable, and it could well be a flyer
      // with a real vacancy. Deleting on a failed download would be punishing someone for our
      // own outage, so it stays - logged, so the gap is visible rather than silent.
      if (!imageDescription) {
        if (media) {
          logger.warn({ groupJid }, "Could not describe the image - leaving it in place rather than deleting blind");
        }

        return;
      }
    }

    const decision = await classify(text, imageDescription);
    if (decision.allowed) {
      return;
    }

    await service.punish({
      groupJid,
      participantJid: senderJid,
      messageKey: message.key,
      reason: decision.reason
    });
  };
}

async function defaultDescribeMedia(message: WAMessage): Promise<string | undefined> {
  const media = findDescribableMedia(message);

  if (!media) {
    return undefined;
  }

  try {
    const data = await downloadMedia(message);
    return await describeImage({ data, mimeType: media.mimeType, isSticker: media.isSticker });
  } catch (error) {
    logger.warn({ err: error }, "Could not describe media for moderation");
    return undefined;
  }
}

// Deleting and removing both require the bot to be a group admin; WhatsApp answers 403 otherwise.
export function createWhatsAppModerationActions(): ModerationActions {
  return {
    async deleteMessage(groupJid: string, key: WAMessageKey): Promise<void> {
      const socket = whatsapp.getSocket();

      if (!socket) {
        throw new Error("WhatsApp socket is not available");
      }

      await socket.sendMessage(groupJid, { delete: key });
    },

    async removeParticipant(groupJid: string, participantJid: string): Promise<void> {
      const socket = whatsapp.getSocket();

      if (!socket) {
        throw new Error("WhatsApp socket is not available");
      }

      await socket.groupParticipantsUpdate(groupJid, [participantJid], "remove");
    }
  };
}
