import { downloadMediaMessage, type WAMessage } from "@whiskeysockets/baileys";
import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { describeImage } from "./image-description.provider.js";

export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};

export type ImageDescriptionListenerOptions = {
  queue?: QueueServiceLike;
  download?: (message: WAMessage) => Promise<Buffer>;
  describe?: (input: { data: Buffer; mimeType: string; isSticker?: boolean }) => Promise<string | undefined>;
};

export type DescribableMedia = {
  mimeType: string;
  isSticker: boolean;
  /** Caption already written by the sender - a described image with a caption is less urgent. */
  caption?: string;
};

// Only still images. Video and audio would need a different model, and animated stickers are
// described from their first frame by the vision model anyway.
export function findDescribableMedia(message: WAMessage): DescribableMedia | undefined {
  const content = message.message;

  if (!content) {
    return undefined;
  }

  if (content.imageMessage) {
    return {
      mimeType: content.imageMessage.mimetype ?? "image/jpeg",
      isSticker: false,
      caption: content.imageMessage.caption ?? undefined
    };
  }

  if (content.stickerMessage) {
    return { mimeType: content.stickerMessage.mimetype ?? "image/webp", isSticker: true };
  }

  return undefined;
}

export function createImageDescriptionListener(
  options: ImageDescriptionListenerOptions = {}
): (message: WAMessage) => Promise<void> {
  const queue = options.queue ?? queueService;
  const download = options.download ?? ((message: WAMessage) => downloadMediaMessage(message, "buffer", {}));
  const describe = options.describe ?? describeImage;

  return async function handleIncomingMessage(message: WAMessage): Promise<void> {
    const groupJid = message.key?.remoteJid;

    // Groups only, and never the bot's own media - describing its own posts would loop.
    if (!groupJid?.endsWith("@g.us") || message.key.fromMe) {
      return;
    }

    const media = findDescribableMedia(message);
    if (!media) {
      return;
    }

    try {
      const data = await download(message);
      const description = await describe({ data, mimeType: media.mimeType, isSticker: media.isSticker });

      if (!description) {
        return;
      }

      await queue.enqueue({
        type: "networking",
        destinationGroup: groupJid,
        payload: { text: `🖼️ Descrição da imagem: ${description}` },
        // The description is only useful next to the image it describes; arriving hours later,
        // after quiet hours, it would be attached to nothing.
        bypassQuietHours: true
      });

      logger.info({ groupJid, isSticker: media.isSticker }, "Image description queued");
    } catch (error) {
      logger.warn({ err: error, groupJid }, "Could not describe media");
    }
  };
}
