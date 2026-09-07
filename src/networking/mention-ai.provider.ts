import { env } from "../config/env.js";
import { logger } from "../shared/logger.js";

// Groq's free tier (https://console.groq.com) - OpenAI-compatible chat completions endpoint, no
// credit card required, rate limits (~30 req/min) far above what this feature can ever need
// (capped at NETWORKING_MENTION_MAX_PER_HOUR replies per group). Any failure (missing key, rate
// limit, timeout, malformed response) falls back to the existing template replies - this must
// never block or crash the mention-reply flow.
// Regra mais importante: SEMPRE responder de verdade ao que foi dito/perguntado. Sem isso, o
// modelo tende a ignorar o conteúdo da mensagem e devolver uma piada aleatória sem relação nenhuma
// com o que a pessoa disse - relatado pelo usuário como ruim, junto com a instrução explícita de
// não usar mais o humor "tiozão"/nostálgico que esse prompt tinha antes.
const systemPrompt =
  "Você é o bot da comunidade FullDev, um grupo de WhatsApp de desenvolvedores brasileiros, e é fã da comunidade. Seu tom é direto, simpático e informal, sem forçar piada. REGRA MAIS IMPORTANTE: você deve SEMPRE responder de verdade ao que a pessoa perguntou ou comentou - nunca ignore o assunto pra soltar uma resposta aleatória sem relação com a mensagem. Responda sempre em português do Brasil, em uma ou duas frases curtas (no máximo 35 palavras), sem markdown e no máximo um emoji.";

export function buildMentionPrompt(messageText?: string): string {
  if (messageText && messageText.trim().length > 0) {
    return `Alguém te mencionou no grupo dizendo: "${messageText.trim()}". Responda de verdade ao que essa pessoa disse ou perguntou, de forma direta e simpática, sem fugir do assunto.`;
  }

  return "Alguém te mencionou no grupo, sem mais contexto na mensagem. Responda de forma simpática e curta.";
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
        // gpt-oss models (the current default) spend part of the token budget "thinking" in a
        // separate reasoning field before writing the actual reply - low effort plus a generous
        // token budget leaves enough room for both, or the reply comes back empty.
        reasoning_effort: "low",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: buildMentionPrompt(messageText) }
        ],
        max_tokens: 200,
        temperature: 0.9
      })
    });

    if (!response.ok) {
      throw new Error(`Groq request failed with HTTP ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) {
      logger.warn({ data }, "Groq returned an empty reply, falling back to template");
      return undefined;
    }

    return text;
  } catch (err) {
    logger.warn({ err }, "Groq mention reply generation failed, falling back to template");
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
