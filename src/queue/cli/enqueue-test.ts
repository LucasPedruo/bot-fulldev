import { queueService } from "../queue.service.js";

const destinationJid = process.argv[2];
const delaySecondsArg = process.argv.find((arg) => arg.startsWith("--delay-seconds="));
const mentions = process.argv
  .filter((arg) => arg.startsWith("--mention="))
  .map((arg) => arg.split("=")[1])
  .filter((jid): jid is string => Boolean(jid));
const delaySeconds = delaySecondsArg ? Number(delaySecondsArg.split("=")[1]) : 0;
const textArgs = process.argv.slice(3).filter((arg) => !arg.startsWith("--delay-seconds=") && !arg.startsWith("--mention="));
const text = textArgs.join(" ") || "Teste enfileirado pelo bot FullDev.";

if (!destinationJid) {
  console.error("Usage: npm run queue:enqueue-test -- <group-jid> <message> [--mention=participant-jid] [--delay-seconds=60]");
  process.exit(1);
}

if (!Number.isFinite(delaySeconds) || delaySeconds < 0) {
  console.error("--delay-seconds must be a positive number");
  process.exit(1);
}

const message = await queueService.enqueue({
  type: "manual",
  destinationGroup: destinationJid,
  payload: {
    text,
    mentions
  },
  scheduledFor: delaySeconds > 0 ? new Date(Date.now() + delaySeconds * 1_000) : undefined
});

console.log(`Queued message ${message.id} to ${destinationJid} for ${message.scheduledFor.toISOString()}`);
process.exit(0);
