import { whatsapp } from "../client.js";

await whatsapp.start();

const timeout = setTimeout(() => {
  console.error(`WhatsApp did not connect in time. Current status: ${whatsapp.getStatus()}`);
  process.exit(1);
}, 120_000);

while (whatsapp.getStatus() !== "connected") {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

clearTimeout(timeout);

const groups = await whatsapp.listGroups();
console.table(groups);
whatsapp.stop();
process.exit(0);
