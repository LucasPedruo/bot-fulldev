import { env } from "../config/env.js";
import { logger } from "../shared/logger.js";
import { normalizeForVision } from "./image-normalizer.js";

// Accessibility feature: a blind member using a screen reader gets nothing at all from an image
// or a sticker. This turns it into text so the content is actually reachable.
//
// It needs a MULTIMODAL model. GROQ_MODEL (openai/gpt-oss-*) is text-only and answers
// "messages[0].content must be a string" to any image payload, so the vision model is a separate
// setting - verified against the account's model list, not assumed.
const systemPrompt = [
  "Você descreve imagens para pessoas cegas que usam leitor de tela em um grupo de WhatsApp.",
  "Escreva em português do Brasil, em texto corrido, sem markdown.",
  "REGRAS: Comece pelo que a imagem é (foto, print de tela, cartaz, meme, gráfico, figurinha).",
  "Se houver texto na imagem, TRANSCREVA o texto integralmente - é a parte mais importante, e é",
  "o que a pessoa mais perde sem a descrição. Descreva só o que dá para ver; nunca especule sobre",
  "quem são as pessoas, o que sentem ou o que aconteceu fora do quadro. Se a imagem estiver",
  "ilegível ou vazia, diga isso em vez de inventar. Máximo de 100 palavras."
].join(" ");

export type DescribeImageInput = {
  /** Raw media bytes, already downloaded and decrypted from WhatsApp. */
  data: Buffer;
  mimeType: string;
  /** Stickers are usually a quick reaction, so they get a shorter, blunter description. */
  isSticker?: boolean;
};

export async function describeImage(input: DescribeImageInput): Promise<string | undefined> {
  if (!env.GROQ_API_KEY) {
    return undefined;
  }

  // Normalized BEFORE the size check: converting an animated WebP or scaling a large photo is
  // exactly what brings it under the limit, so checking first would reject images that are
  // perfectly describable.
  const normalized = await normalizeForVision(input.data, input.mimeType);

  if (normalized.data.length > env.IMAGE_DESCRIPTION_MAX_BYTES) {
    logger.warn(
      { bytes: normalized.data.length, limit: env.IMAGE_DESCRIPTION_MAX_BYTES },
      "Image too large to describe, skipping"
    );
    return undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const dataUri = `data:${normalized.mimeType};base64,${normalized.data.toString("base64")}`;
    const instruction = input.isSticker
      ? "Descreva esta figurinha em no máximo 20 palavras, incluindo qualquer texto que apareça nela."
      : "Descreva esta imagem para alguém que não pode vê-la, transcrevendo todo texto presente.";

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: env.GROQ_VISION_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              { type: "image_url", image_url: { url: dataUri } }
            ]
          }
        ],
        max_tokens: 500,
        // A description is a factual readout, not a creative exercise.
        temperature: 0.2
      })
    });

    if (!response.ok) {
      throw new Error(`Groq vision request failed with HTTP ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) {
      logger.warn("Groq returned an empty image description");
      return undefined;
    }

    return text;
  } catch (err) {
    // Same policy as every other Groq call here: a failure degrades the feature, never the bot.
    logger.warn({ err }, "Image description failed");
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
