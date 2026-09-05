import { whatsapp } from "./client.js";

export type WhatsAppParticipant = {
  jid: string;
  name?: string;
  isAdmin: boolean;
};

export async function getGroupParticipants(groupJid: string): Promise<WhatsAppParticipant[]> {
  const socket = whatsapp.getSocket();

  if (!socket || whatsapp.getStatus() !== "connected") {
    throw new Error(`WhatsApp is not connected. Current status: ${whatsapp.getStatus()}`);
  }

  const metadata = await socket.groupMetadata(groupJid);

  return metadata.participants.map((participant) => ({
    jid: participant.id,
    name: participant.name,
    isAdmin: participant.admin === "admin" || participant.admin === "superadmin"
  }));
}
