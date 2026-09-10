import type { BaileysEventMap } from "@whiskeysockets/baileys";
import { logger } from "../shared/logger.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { joinRequestService, type JoinRequestService } from "./join-request.service.js";

export type GroupJoinRequestUpdate = BaileysEventMap["group.join-request"];

export type JoinRequestListenerOptions = {
  networkingGroups?: string[];
  service?: Pick<JoinRequestService, "processGroup">;
};

// Reacts to a request arriving while the bot is online. It deliberately re-reads the full pending
// list from WhatsApp instead of acting on the single participant in the event: several requests
// often land at once, and the capacity check has to see all of them to decide how many fit.
export function createJoinRequestListener(
  options: JoinRequestListenerOptions = {}
): (update: GroupJoinRequestUpdate) => Promise<void> {
  const service = options.service ?? joinRequestService;

  return async function handleGroupJoinRequest(update: GroupJoinRequestUpdate): Promise<void> {
    const networkingGroups = options.networkingGroups ?? getConfiguredWhatsAppGroups().networkingGroups;
    if (!networkingGroups.includes(update.id)) {
      return;
    }

    // WhatsApp also emits this event when a request is revoked or already decided; only a fresh
    // "created" request can lead to an approval, and re-sweeping on the others is wasted work.
    if (update.action !== "created") {
      return;
    }

    try {
      await service.processGroup(update.id);
    } catch (error) {
      logger.error({ err: error, groupJid: update.id }, "Failed to handle group join request");
    }
  };
}
