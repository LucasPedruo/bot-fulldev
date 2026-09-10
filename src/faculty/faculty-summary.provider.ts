import { env } from "../config/env.js";
import { logger } from "../shared/logger.js";

// Same Groq endpoint and failure policy as the mention replies: any problem (missing key, rate
// limit, timeout, malformed response) returns undefined and the caller falls back to relaying the
// original text. Losing the announcement entirely would be worse than relaying it unsummarized.
const systemPrompt = [
  "Você resume avisos sobre eventos e oportunidades acadêmicas para estudantes de tecnologia.",
  "Você recebe uma ou mais mensagens publicadas por professores e representantes de eixo em um",
  "grupo de WhatsApp, e escreve um resumo curto para outro grupo de alunos.",
  "REGRAS: Escreva em português do Brasil, direto e objetivo. Preserve TODOS os dados concretos -",
  "nome do evento, data, horário, local, link e prazo de inscrição. Nunca invente informação que",
  "não esteja nas mensagens, e nunca preencha um dado ausente com suposição: se a data ou o local",
  "não foram ditos, simplesmente não mencione. Não use markdown. Se houver mais de um evento,",
  "separe em tópicos começando com '•'. Máximo de 120 palavras."
].join(" ");

export function buildSummaryPrompt(messages: string[]): string {
  const numbered = messages.map((message, index) => `Mensagem ${index + 1}: ${message}`).join("\n\n");

  return [
    "Resuma para os alunos o que foi divulgado nas mensagens abaixo.",
    "Se elas forem partes de um mesmo aviso, junte tudo em um resumo só.",
    "",
    numbered
  ].join("\n");
}

export async function generateEventSummary(messages: string[]): Promise<string | undefined> {
  if (!env.GROQ_API_KEY || messages.length === 0) {
    return undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

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
          { role: "user", content: buildSummaryPrompt(messages) }
        ],
        max_tokens: 800,
        // Much lower than the mention replies: this is a factual summary, and creativity here
        // means invented dates.
        temperature: 0.2
      })
    });

    if (!response.ok) {
      throw new Error(`Groq request failed with HTTP ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) {
      logger.warn({ data }, "Groq returned an empty summary, falling back to the raw messages");
      return undefined;
    }

    return text;
  } catch (err) {
    logger.warn({ err }, "Groq event summary generation failed, falling back to the raw messages");
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
