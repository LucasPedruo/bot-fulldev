import { env } from "../config/env.js";
import { logger } from "../shared/logger.js";

// This classifier decides whether someone's message gets deleted, and repeated deletions can get
// them removed from the community. That asymmetry drives every choice here: letting a bit of
// chatter through costs almost nothing, while deleting a real job posting, technical question or
// career conversation takes something from a real person who will not know why.
//
// So the prompt is deliberately biased towards allowing, and every failure path (no key, timeout,
// bad response, unparseable answer) resolves to "allowed" rather than to a deletion.
const jobsSystemPrompt = [
  "Voce modera um grupo de WhatsApp cujo unico proposito e a divulgacao de vagas de emprego em",
  "tecnologia. Voce recebe uma mensagem e decide se ela pertence ao grupo.",
  "",
  "PERMITIDO (responda allow):",
  "- Divulgacao de vaga, estagio, freelance ou oportunidade de trabalho, completa ou nao.",
  "- Pedido para o bot filtrar ou buscar vagas (ex.: 'vagas de junior frontend').",
  "- Pergunta ou detalhe sobre uma vaga que foi divulgada (salario, requisito, link, contato).",
  "- Alguem se candidatando, pedindo indicacao ou dizendo que enviou curriculo para uma vaga.",
  "- Recrutador pedindo perfis para uma vaga.",
  "",
  "NAO PERMITIDO (responda remove):",
  "- Conversa paralela sem relacao com vaga nenhuma (bom dia, papo furado, politica, memes).",
  "- Divulgacao de curso, produto, servico, canal ou grupo - isso nao e vaga.",
  "- Corrente, spam, golpe ou conteudo ofensivo.",
  "",
  "REGRA DECISIVA: na duvida, responda allow. E muito pior apagar uma vaga de verdade do que",
  "deixar passar uma conversa. So responda remove quando estiver claro que a mensagem nao tem",
  "nenhuma relacao com vagas.",
  "",
  'Responda APENAS com um JSON: {"decision":"allow"|"remove","reason":"<motivo curto>"}'
].join("\n");

const networkingSystemPrompt = [
  "Voce modera um grupo de WhatsApp da comunidade FullDev para networking profissional em tecnologia.",
  "Voce recebe uma mensagem e decide se ela pertence ao grupo.",
  "",
  "PERMITIDO (responda allow):",
  "- Discussoes de tecnologia, engenharia de software, ferramentas, arquitetura, dados, IA e seguranca.",
  "- Duvidas tecnicas, ajuda com codigo, estudo, projeto, carreira, portfolio, entrevistas e mercado tech.",
  "- Debates gerais de tecnologia, crescimento profissional, colaboracao e feedback construtivo.",
  "- Combinados do projeto, prazos, ajuda para cumprir tarefas e alinhamentos tecnicos.",
  "",
  "NAO PERMITIDO (responda remove):",
  "- Assuntos fora de tecnologia/carreira/projeto. Esses temas devem ser direcionados ao grupo Off Topic.",
  "- Politica, candidatos, partidos, guerra cultural, propaganda partidaria ou discussao religiosa.",
  "- Discriminacao ou ataque por cor da pele, etnia, religiao, orientacao sexual, genero ou identidade.",
  "- Ofensas, humilhacao, xingamento, provocacao agressiva, assedio ou conflito sem respeito.",
  "- Linguagem claramente inadequada para um ambiente profissional.",
  "- Conteudo sensivel, violento, sexual, chocante ou links/material de pirataria.",
  "- Spam, golpe, corrente, divulgacao aleatoria ou figurinha/meme politico.",
  "",
  "REGRA DECISIVA: na duvida, responda allow. E pior apagar uma duvida tecnica real ou conversa",
  "de carreira do que deixar passar algo leve. So responda remove quando a violacao estiver clara.",
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
    // A useful image can arrive with no text at all. Judging it without the description would
    // delete a potentially valid post for being "empty".
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
  return classifyWithPrompt(jobsSystemPrompt, text, imageDescription);
}

export async function classifyNetworkingGroupMessage(
  text: string,
  imageDescription?: string
): Promise<ModerationDecision> {
  return classifyWithPrompt(networkingSystemPrompt, text, imageDescription);
}

async function classifyWithPrompt(
  systemPrompt: string,
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
