import { downloadMediaMessage, type WAMessage } from "@whiskeysockets/baileys";

// WhatsApp's current media host. Baileys derives the host from the `url` carried in the message
// proto and only falls back to this one when there is none - so a message whose proto still
// points at the retired `a.whatsapp.net` fails with ENOTFOUND before it ever reaches the network.
// Seen in production: two of three media downloads died that way while mmg.whatsapp.net resolved
// perfectly from the same container.
const CURRENT_MEDIA_HOST = "mmg.whatsapp.net";

export type DownloadMediaFn = (message: WAMessage, host?: string) => Promise<Buffer>;

const defaultDownload: DownloadMediaFn = (message, host) =>
  downloadMediaMessage(message, "buffer", host ? { host } : {});

// Tries whatever the message says first (a non-default host can be legitimate), then retries
// pinned to the current host rather than giving up on a stale one.
export async function downloadMedia(message: WAMessage, download: DownloadMediaFn = defaultDownload): Promise<Buffer> {
  try {
    return await download(message);
  } catch (error) {
    if (!isUnresolvableHostError(error)) {
      throw error;
    }

    return download(message, CURRENT_MEDIA_HOST);
  }
}

export function isUnresolvableHostError(error: unknown): boolean {
  // undici wraps the DNS failure, so the code lives on the cause rather than on the error itself.
  const candidate = error as { code?: unknown; cause?: { code?: unknown } } | null;
  return candidate?.code === "ENOTFOUND" || candidate?.cause?.code === "ENOTFOUND";
}
