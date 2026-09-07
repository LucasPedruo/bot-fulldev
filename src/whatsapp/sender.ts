import { whatsapp } from "./client.js";

export async function sendTextMessage(
  destinationJid: string,
  text: string,
  mentions: string[] = [],
  mentionAll = false
): Promise<void> {
  await whatsapp.sendText(destinationJid, text, mentions, mentionAll);
}

export async function sendPollMessage(
  destinationJid: string,
  name: string,
  values: string[],
  selectableCount?: number
): Promise<void> {
  await whatsapp.sendPoll(destinationJid, name, values, selectableCount);
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
