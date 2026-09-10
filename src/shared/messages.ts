import type { WAMessage } from "@whiskeysockets/baileys";

// A WhatsApp message carries its text in a different field depending on how it was sent: a bare
// message uses "conversation", one with a link preview or a mention uses "extendedTextMessage",
// and an attachment puts the text in the caption. Announcements in the representatives group are
// very often a flyer with the details in the caption, so captions cannot be ignored.
export function extractMessageText(message: WAMessage): string | undefined {
  const content = message.message;

  if (!content) {
    return undefined;
  }

  const text =
    content.conversation ??
    content.extendedTextMessage?.text ??
    content.imageMessage?.caption ??
    content.videoMessage?.caption ??
    content.documentMessage?.caption ??
    content.documentWithCaptionMessage?.message?.documentMessage?.caption ??
    undefined;

  const trimmed = text?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}
