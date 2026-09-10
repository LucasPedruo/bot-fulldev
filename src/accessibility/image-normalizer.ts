import sharp from "sharp";
import { logger } from "../shared/logger.js";

export type NormalizedImage = {
  data: Buffer;
  mimeType: string;
};

// The vision model answers "invalid image data" to WhatsApp's animated WebP stickers, which is
// most of them - seen in production. sharp reads the first frame by default (animated: true is
// what would keep the rest), so converting to PNG both drops the animation and lands on a format
// the model accepts.
const CONVERTED_MIME_TYPES = new Set(["image/webp", "image/gif", "image/tiff", "image/avif", "image/heic"]);

// Base64 inflates by ~33% and the model gains nothing from a huge image, so anything past this
// gets scaled down before encoding. Text in a flyer stays legible at this size.
const MAX_DIMENSION = 1400;

export async function normalizeForVision(
  data: Buffer,
  mimeType: string,
  convert: typeof sharp = sharp
): Promise<NormalizedImage> {
  const needsConversion = CONVERTED_MIME_TYPES.has(mimeType.toLowerCase());

  try {
    const image = convert(data);
    const metadata = await image.metadata();
    const tooLarge = (metadata.width ?? 0) > MAX_DIMENSION || (metadata.height ?? 0) > MAX_DIMENSION;

    if (!needsConversion && !tooLarge) {
      return { data, mimeType };
    }

    const pipeline = tooLarge
      ? image.resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      : image;

    return { data: await pipeline.png().toBuffer(), mimeType: "image/png" };
  } catch (error) {
    // A conversion failure must not cost the description entirely - the original may still work.
    logger.warn({ err: error, mimeType }, "Could not normalize the image, sending it as-is");
    return { data, mimeType };
  }
}
