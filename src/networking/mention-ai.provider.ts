import { env } from "../config/env.js";
import { logger } from "../shared/logger.js";

// Groq's free tier (https://console.groq.com) - OpenAI-compatible chat completions endpoint, no
// credit card required, rate limits (~30 req/min) far above what this feature can ever need
// (capped at NETWORKING_MENTION_MAX_PER_HOUR replies per group). Any failure (missing key, rate
// limit, timeout, malformed response) falls back to the existing template replies - this must
// never block or crash the mention-reply flow.
const systemPrompt =
  "Você é o bot de um grupo de WhatsApp de desenvolvedores brasileiros. Seu estilo é engraçado, autodepreciativo e informal, no mesmo tom de humor de dev (deploy de sexta, bugs bizarros, café, Stack Overflow). Responda sempre em português do Brasil, em uma frase curta (no máximo 25 palavras), sem markdown e com no máximo um emoji.";

export function buildMentionPrompt(messageText?: string): string {
  if (messageText && messageText.trim().length > 0) {
    return `Alguém te mencionou no grupo dizendo: "${messageText.trim()}". Responda de forma engraçada e curta.`;
  }

  return "Alguém te mencionou no grupo, sem mais contexto na mensagem. Responda de forma engraçada e curta.";
}

export async function generateMentionReply(messageText?: string): Promise<string | undefined> {
  if (!env.GROQ_API_KEY) {
    return undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: buildMentionPrompt(messageText) }
        ],
        max_tokens: 80,
        temperature: 0.9
      })
    });

    if (!response.ok) {
      throw new Error(`Groq request failed with HTTP ${response.status}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text && text.length > 0 ? text : undefined;
  } catch (err) {
    logger.warn({ err }, "Groq mention reply generation failed, falling back to template");
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
