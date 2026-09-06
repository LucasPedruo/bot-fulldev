import { jidNormalizedUser } from "@whiskeysockets/baileys";

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
