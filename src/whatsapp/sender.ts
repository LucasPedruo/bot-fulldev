import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
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

export async function sendImageMessage(destinationJid: string, filename: string, caption?: string): Promise<void> {
  const filePath = path.join(env.MEMES_DIR, filename);
  const image = await readFile(filePath);
  await whatsapp.sendImage(destinationJid, image, caption);
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
