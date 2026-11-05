import { env } from "../config/env.js";
import { logger } from "../shared/logger.js";
import { buildPersonaSystemPrompt } from "./persona.js";

// Same Groq free tier as mention-ai.provider.ts. Ambient calls are bounded independently of
// message volume: a reaction can only be picked once per NETWORKING_AMBIENT_REACTION_MIN_GAP_MINUTES
// per group, and a reply only up to NETWORKING_AMBIENT_REPLY_MAX_PER_HOUR per group - both checked
// in ambient-engagement.service.ts before either of these functions is ever called.
const systemPrompt = buildPersonaSystemPrompt({ maxWords: 20 });

const NO_REACTION = "NONE";

export function buildAmbientReplyPrompt(messageText: string): string {
  return `Você está acompanhando a conversa do grupo sem ter sido chamado. Alguém acabou de comentar: "${messageText}". Comente de forma breve e natural sobre o que essa pessoa disse, como quem está participando da conversa por conta própria.`;
}

export function buildAmbientReactionPrompt(messageText: string): string {
  return `Alguém comentou no grupo: "${messageText}". Se um único emoji combinar bem com o contexto dessa mensagem, responda só com esse emoji, nada mais. Se nenhum emoji couber bem, responda exatamente "${NO_REACTION}".`;
}

export async function generateAmbientReply(messageText: string): Promise<string | undefined> {
  return callGroq(buildAmbientReplyPrompt(messageText), 120, "Groq ambient reply generation failed, falling back to template");
}

export async function generateAmbientReaction(messageText: string): Promise<string | undefined> {
  const raw = await callGroq(buildAmbientReactionPrompt(messageText), 10, "Groq ambient reaction generation failed, falling back to keywords");
  if (!raw || raw.toUpperCase().includes(NO_REACTION)) {
    return undefined;
  }

  // The model is asked for exactly one emoji, but take only the first grapheme in case it adds
  // stray text anyway - a multi-character reaction renders as literal text, not a WhatsApp reaction.
  const firstGrapheme = [...new Intl.Segmenter().segment(raw)][0]?.segment;
  return firstGrapheme && /\p{Extended_Pictographic}/u.test(firstGrapheme) ? firstGrapheme : undefined;
}

async function callGroq(userPrompt: string, maxTokens: number, failureLogMessage: string): Promise<string | undefined> {
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
        reasoning_effort: "low",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.9
      })
    });

    if (!response.ok) {
      throw new Error(`Groq request failed with HTTP ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) {
      logger.warn({ data }, "Groq returned an empty ambient response, falling back");
      return undefined;
    }

    return text;
  } catch (err) {
    logger.warn({ err }, failureLogMessage);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
