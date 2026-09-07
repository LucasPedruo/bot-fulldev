import { jidNormalizedUser, type WASocket } from "@whiskeysockets/baileys";

// WhatsApp mentions can reference either the phone-number JID (...@s.whatsapp.net) or the newer
// LID identity (...@lid), depending on the group's addressing mode - callers must pass both of the
// bot's own JIDs for a mention to be recognized regardless of which one WhatsApp used.
export function isBotMentioned(mentionedJids: string[] | null | undefined, botJids: string[]): boolean {
  if (!mentionedJids || mentionedJids.length === 0 || botJids.length === 0) {
    return false;
  }

  const normalizedBotJids = new Set(botJids.map(jidNormalizedUser));
  return mentionedJids.some((jid) => normalizedBotJids.has(jidNormalizedUser(jid)));
}

// Building an outgoing "@<number> tag" (or the mentions array entry) straight from a LID renders
// as plain unlinked text in WhatsApp clients - they can only resolve a mention to a real contact
// name from the phone-number JID. Baileys keeps a LID<->phone-number mapping (built from the
// group's own membership data) that can resolve it; when no mapping is known yet, the original JID
// is returned unchanged rather than throwing, since a plain-text fallback beats a crash.
export async function resolvePhoneJid(jid: string, socket: WASocket): Promise<string> {
  if (!jid.endsWith("@lid")) {
    return jid;
  }

  try {
    const phoneJid = await socket.signalRepository.lidMapping.getPNForLID(jid);
    return phoneJid ?? jid;
  } catch {
    return jid;
  }
}

export async function resolvePhoneJids(jids: string[], socket: WASocket): Promise<string[]> {
  return Promise.all(jids.map((jid) => resolvePhoneJid(jid, socket)));
}

// A resolved phone-number JID carries a ":<device>" suffix (e.g. "5511999999999:0@s.whatsapp.net").
// WhatsApp only renders the "@<number>" text as a real tappable mention when it matches the bare
// number with no device suffix - leaving it in shows up as literal unlinked text "@5511999999999:0".
export function buildMentionTag(jid: string): string {
  return `@${jid.split("@")[0].split(":")[0]}`;
}
