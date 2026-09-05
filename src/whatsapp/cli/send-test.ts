import { env } from "../../config/env.js";
import { whatsapp } from "../client.js";

const destinationJid = process.argv[2];
const text = process.argv.slice(3).join(" ") || "Teste do bot FullDev.";

if (!destinationJid) {
  console.error("Usage: npm run whatsapp:send-test -- <group-jid> <message>");
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
await whatsapp.sendText(destinationJid, text);
console.log(`Message sent to ${destinationJid} using timezone ${env.TZ}`);
whatsapp.stop();
process.exit(0);
