import { COMMUNITY_CONTEXT, PERSONA_NAME } from "./persona.js";

// Two audiences, two messages. Inside the community everyone already knows what FullDev is, so
// pitching it back at them is noise; outside it, the introduction is the whole point - the bot is
// a guest and should say who invited it and where it comes from.
export function buildInternalIntroduction(): string {
  return [
    `🦆 Oi! Eu sou o ${PERSONA_NAME}, o pato sentinela da Comunidade FullDev.`,
    "",
    "A partir de agora eu fico de olho por aqui: dou boas-vindas a quem chega, respondo quando me",
    "marcam e trago vagas e eventos quando aparecem.",
    "",
    "É só me chamar com @ que eu apareço."
  ].join("\n");
}

export function buildExternalIntroduction(): string {
  return [
    `🦆 Oi, pessoal! Eu sou o ${PERSONA_NAME}, um pato dev de óculos e o sentinela da Comunidade FullDev.`,
    "",
    COMMUNITY_CONTEXT,
    "",
    "Fui adicionado aqui e vou ficar na minha: respondo quando me marcam com @ e, se fizer sentido",
    "para o grupo, trago vagas e eventos de tecnologia.",
    "",
    "Prazer em conhecer vocês!"
  ].join("\n");
}

export function buildGroupIntroduction(options: { isCommunityGroup: boolean }): string {
  return options.isCommunityGroup ? buildInternalIntroduction() : buildExternalIntroduction();
}
