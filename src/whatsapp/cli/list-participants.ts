import { whatsapp } from "../client.js";

const groupJid = process.argv[2];

if (!groupJid) {
  console.error("Usage: npm run whatsapp:list-participants -- <group-jid>");
  process.exit(1);
}

await whatsapp.start();

const timeout = setTimeout(() => {
  console.error(`WhatsApp did not connect in time. Current status: ${whatsapp.getStatus()}`);
  process.exit(1);
}, 120_000);

while (whatsapp.getStatus() !== "connected") {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

clearTimeout(timeout);

const socket = whatsapp.getSocket();
if (!socket) {
  throw new Error("WhatsApp socket is not available");
}

const metadata = await socket.groupMetadata(groupJid);
const participants = metadata.participants
  .map((participant) => ({
    jid: participant.id,
    name: participant.name ?? "",
    admin: participant.admin ?? ""
  }))
  .sort((a, b) => a.jid.localeCompare(b.jid));

console.table(participants);
whatsapp.stop();
process.exit(0);
