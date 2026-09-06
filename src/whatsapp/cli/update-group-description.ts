import { whatsapp } from "../client.js";

const groupJid = process.argv[2];
const description = process.argv.slice(3).join(" ");

if (!groupJid || !description) {
  console.error("Usage: npm run whatsapp:update-group-description -- <group-jid> <description text>");
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
await whatsapp.updateGroupDescription(groupJid, description);
console.log(`Group description updated for ${groupJid}`);
whatsapp.stop();
process.exit(0);
