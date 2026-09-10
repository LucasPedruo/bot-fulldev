import { jidNormalizedUser, type WAMessage } from "@whiskeysockets/baileys";
import { logger } from "../shared/logger.js";
import { extractMessageText } from "../shared/messages.js";
import { whatsapp } from "../whatsapp/client.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { facultyRelayService, type FacultyRelayService } from "./faculty-relay.service.js";

export type FacultyRelayListenerOptions = {
  sourceGroup?: string;
  service?: Pick<FacultyRelayService, "ingest">;
  isGroupAdmin?: (groupJid: string, senderJid: string) => Promise<boolean>;
};

export function createFacultyRelayListener(
  options: FacultyRelayListenerOptions = {}
): (message: WAMessage) => Promise<void> {
  const service = options.service ?? facultyRelayService;
  const isGroupAdmin = options.isGroupAdmin ?? createAdminChecker();

  return async function handleIncomingMessage(message: WAMessage): Promise<void> {
    const sourceGroup = options.sourceGroup ?? getConfiguredWhatsAppGroups().eixoRepresentativesGroup;

    if (sourceGroup.length === 0 || message.key?.remoteJid !== sourceGroup || message.key.fromMe) {
      return;
    }

    const text = extractMessageText(message);
    if (!text) {
      return;
    }

    // In a group, key.participant is the actual sender; key.remoteJid is the group itself.
    const senderJid = message.key.participant;
    if (!senderJid) {
      return;
    }

    try {
      // Only the professors and the representatives run this group, and they are its admins -
      // that is the whole filter. Student chatter in between must not reach the events group.
      if (!(await isGroupAdmin(sourceGroup, senderJid))) {
        return;
      }
    } catch (error) {
      // Failing to read the membership must not turn into relaying everything - stay silent.
      logger.warn({ err: error, groupJid: sourceGroup }, "Could not verify sender is an admin - skipping message");
      return;
    }

    service.ingest(text);
  };
}

// Group metadata is a network round-trip, and an active group would trigger one per message. The
// admin list changes rarely, so a short-lived cache is plenty.
const ADMIN_CACHE_TTL_MS = 10 * 60 * 1000;

export function createAdminChecker(
  fetchAdmins: (groupJid: string) => Promise<string[]> = defaultFetchAdmins,
  now: () => number = () => Date.now()
): (groupJid: string, senderJid: string) => Promise<boolean> {
  const cache = new Map<string, { admins: Set<string>; fetchedAt: number }>();

  return async function isGroupAdmin(groupJid: string, senderJid: string): Promise<boolean> {
    const cached = cache.get(groupJid);
    let entry = cached;

    if (!entry || now() - entry.fetchedAt > ADMIN_CACHE_TTL_MS) {
      const admins = await fetchAdmins(groupJid);
      entry = { admins: new Set(admins.map(jidNormalizedUser)), fetchedAt: now() };
      cache.set(groupJid, entry);
    }

    return entry.admins.has(jidNormalizedUser(senderJid));
  };
}

async function defaultFetchAdmins(groupJid: string): Promise<string[]> {
  const socket = whatsapp.getSocket();

  if (!socket) {
    throw new Error("WhatsApp socket is not available");
  }

  const metadata = await socket.groupMetadata(groupJid);

  return metadata.participants
    .filter((participant) => participant.admin === "admin" || participant.admin === "superadmin")
    .map((participant) => participant.id);
}
