import { whatsapp } from "./client.js";

export async function sendTextMessage(destinationJid: string, text: string, mentions: string[] = []): Promise<void> {
  await whatsapp.sendText(destinationJid, text, mentions);
}

export async function sendPollMessage(
  destinationJid: string,
  name: string,
  values: string[],
  selectableCount?: number
): Promise<void> {
  await whatsapp.sendPoll(destinationJid, name, values, selectableCount);
}
