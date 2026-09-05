import { whatsapp } from "./client.js";

export async function sendTextMessage(destinationJid: string, text: string, mentions: string[] = []): Promise<void> {
  await whatsapp.sendText(destinationJid, text, mentions);
}
