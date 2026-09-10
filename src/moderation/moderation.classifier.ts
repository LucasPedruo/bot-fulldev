import { env } from "../config/env.js";
import { logger } from "../shared/logger.js";

// This classifier decides whether someone's message gets deleted, and three deletions get them
// removed from the community. That asymmetry drives every choice here: letting a bit of chatter
// through costs almost nothing, while deleting a real job posting - or a question the group is
// there to answer - takes something from a real person who will not know why.
//
// So the prompt is deliberately biased towards allowing, and every failure path (no key, timeout,
// bad response, unparseable answer) resolves to "allowed" rather than to a deletion.
const systemPrompt = [
  "Você modera um grupo de WhatsApp cujo único propósito é a divulgação de vagas de emprego em",
  "tecnologia. Você recebe uma mensagem e decide se ela pertence ao grupo.",
  "",
  "PERMITIDO (responda allow):",
  "- Divulgação de vaga, estágio, freelance ou oportunidade de trabalho, completa ou não.",
  "- Pedido para o bot filtrar ou buscar vagas (ex.: 'vagas de junior frontend').",
  "- Pergunta ou detalhe sobre uma vaga que foi divulgada (salário, requisito, link, contato).",
  "- Alguém se candidatando, pedindo indicação ou dizendo que enviou currículo para uma vaga.",
  "- Recrutador pedindo perfis para uma vaga.",
  "",
  "NÃO PERMITIDO (responda remove):",
  "- Conversa paralela sem relação com vaga nenhuma (bom dia, papo furado, política, memes).",
  "- Divulgação de curso, produto, serviço, canal ou grupo - isso não é vaga.",
  "- Corrente, spam, golpe ou conteúdo ofensivo.",
  "",
  "REGRA DECISIVA: na dúvida, responda allow. É muito pior apagar uma vaga de verdade do que",
  "deixar passar uma conversa. Só responda remove quando estiver claro que a mensagem não tem",
  "nenhuma relação com vagas.",
  "",
  'Responda APENAS com um JSON: {"decision":"allow"|"remove","reason":"<motivo curto>"}'
].join("\n");

export type ModerationDecision = {
  allowed: boolean;
  reason: string;
};

const ALLOWED: ModerationDecision = { allowed: true, reason: "default-allow" };

export function buildClassificationPrompt(text: string, imageDescription?: string): string {
  if (imageDescription) {
    // A job posted as a flyer arrives with no text at all. Judging it without the description
    // would delete a perfectly valid posting for being "empty".
    return [
      "Mensagem enviada no grupo:",
      text.trim().length > 0 ? text.trim() : "(sem texto)",
      "",
      "A mensagem contém uma imagem. Descrição da imagem:",
      imageDescription
    ].join("\n");
  }

  return `Mensagem enviada no grupo:\n${text.trim()}`;
}

export async function classifyJobsGroupMessage(
  text: string,
  imageDescription?: string
): Promise<ModerationDecision> {
  if (!env.GROQ_API_KEY) {
    return ALLOWED;
  }

  if (text.trim().length === 0 && !imageDescription) {
    return ALLOWED;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

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
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: buildClassificationPrompt(text, imageDescription) }
        ],
        max_tokens: 300,
        // A moderation call must be as close to deterministic as the model allows: the same
        // message should not be deleted on Tuesday and kept on Wednesday.
        temperature: 0
      })
    });

    if (!response.ok) {
      throw new Error(`Groq moderation request failed with HTTP ${response.status}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return parseDecision(data.choices?.[0]?.message?.content);
  } catch (err) {
    // Never delete because the classifier was unavailable.
    logger.warn({ err }, "Moderation classification failed, allowing the message");
    return ALLOWED;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseDecision(content: string | undefined): ModerationDecision {
  if (!content) {
    return ALLOWED;
  }

  try {
    const parsed = JSON.parse(content) as { decision?: unknown; reason?: unknown };
    // Only the exact string "remove" removes. Anything else - a typo, a refusal, a different
    // shape - falls through to allowed.
    if (parsed.decision === "remove") {
      return {
        allowed: false,
        reason: typeof parsed.reason === "string" && parsed.reason.length > 0 ? parsed.reason : "off-topic"
      };
    }

    return ALLOWED;
  } catch {
    logger.warn({ content }, "Could not parse the moderation decision, allowing the message");
    return ALLOWED;
  }
}
