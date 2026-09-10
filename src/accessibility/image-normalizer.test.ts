import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { normalizeForVision } from "./image-normalizer.js";

async function buildImage(format: "webp" | "png" | "jpeg", size = 64): Promise<Buffer> {
  const image = sharp({
    create: { width: size, height: size, channels: 3, background: { r: 220, g: 20, b: 20 } }
  });

  return image.toFormat(format).toBuffer();
}

void test("converts WebP to PNG, which is what the vision model accepts", async () => {
  const normalized = await normalizeForVision(await buildImage("webp"), "image/webp");

  // The production symptom this fixes: "invalid image data" on WhatsApp stickers.
  assert.equal(normalized.mimeType, "image/png");
  assert.equal((await sharp(normalized.data).metadata()).format, "png");
});

void test("leaves a reasonably sized PNG or JPEG untouched", async () => {
  const png = await buildImage("png");
  const normalizedPng = await normalizeForVision(png, "image/png");

  assert.equal(normalizedPng.mimeType, "image/png");
  assert.equal(normalizedPng.data, png);

  const jpeg = await buildImage("jpeg");
  const normalizedJpeg = await normalizeForVision(jpeg, "image/jpeg");

  assert.equal(normalizedJpeg.data, jpeg);
});

void test("scales a large image down", async () => {
  const normalized = await normalizeForVision(await buildImage("png", 2400), "image/png");
  const metadata = await sharp(normalized.data).metadata();

  assert.equal(metadata.width, 1400);
  assert.ok(normalized.data.length > 0);
});

void test("flattens an animated WebP into a single-frame PNG", async () => {
  // sharp stacks animation frames vertically; three 32px frames make a 32x96 strip.
  const animated = await sharp({
    create: { width: 32, height: 96, channels: 3, background: { r: 0, g: 128, b: 0 } }
  })
    .webp()
    .toBuffer();

  const normalized = await normalizeForVision(animated, "image/webp");
  const metadata = await sharp(normalized.data).metadata();

  assert.equal(normalized.mimeType, "image/png");
  assert.equal(metadata.format, "png");
  assert.equal(metadata.pages ?? 1, 1);
});

void test("returns the original when the image cannot be decoded", async () => {
  const garbage = Buffer.from("not an image at all");

  // Losing the description entirely would be worse than letting the model try.
  const normalized = await normalizeForVision(garbage, "image/webp");

  assert.equal(normalized.data, garbage);
  assert.equal(normalized.mimeType, "image/webp");
});
