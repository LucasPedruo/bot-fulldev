import type { WAMessageKey } from "@whiskeysockets/baileys";
import { whatsapp } from "./client.js";

export async function sendReaction(destinationJid: string, messageKey: WAMessageKey, emoji: string): Promise<void> {
  await whatsapp.sendReaction(destinationJid, messageKey, emoji);
}

export async function sendTextMessage(
  destinationJid: string,
  text: string,
  mentions: string[] = []
): Promise<void> {
  await whatsapp.sendText(destinationJid, text, mentions);
}

export async function sendEventMessage(
  destinationJid: string,
  name: string,
  description: string | undefined,
  startDateIso: string,
  endDateIso?: string
): Promise<void> {
  await whatsapp.sendEvent(destinationJid, name, description, new Date(startDateIso), endDateIso ? new Date(endDateIso) : undefined);
}
