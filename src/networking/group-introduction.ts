import { getConfiguredWhatsAppGroups, isConfiguredGroup } from "../whatsapp/groups.js";
import { COMMUNITY_CONTEXT, PERSONA_NAME } from "./persona.js";

// What the bot actually does differs per group, and the introduction is where the people in that
// group find out. A generic "hi, I'm a bot" tells them nothing about what to expect from it.
export type GroupRole = "relay_source" | "relay_destination" | "community" | "external";

export function resolveGroupRole(groupJid: string): GroupRole {
  const groups = getConfiguredWhatsAppGroups();

  if (groupJid.length > 0 && groupJid === groups.eixoRepresentativesGroup) {
    return "relay_source";
  }

  if (groupJid.length > 0 && groupJid === groups.facultyEventsGroup) {
    return "relay_destination";
  }

  return isConfiguredGroup(groupJid) ? "community" : "external";
}

// The professors need to know their announcements are being read and forwarded somewhere else -
// that is not a detail to leave implicit, it is the whole reason the bot is in their group. This
// is also the single message the bot ever sends here; the relay itself only reads.
function buildRelaySourceIntroduction(): string {
  return [
    `🦆 Oi, pessoal! Eu sou o ${PERSONA_NAME}, mascote e sentinela da Comunidade FullDev.`,
    "",
    "Fui adicionado aqui com uma função específica, e quero deixar claro como ela funciona:",
    "",
    "• Eu leio o que é divulgado neste grupo.",
    "• Quando um evento, palestra, edital ou oportunidade é anunciado, eu monto um resumo.",
    "• Esse resumo é publicado no grupo Eventos e oportunidades, para os alunos.",
    "",
    "Duas coisas importantes:",
    "",
    "• Só repasso mensagens de quem é admin do grupo. Conversa entre vocês não sai daqui.",
    "• Não converso nem respondo neste grupo. Esta é a única mensagem que vou mandar aqui.",
    "",
    "Se algo não deve ser repassado, é só avisar um admin."
  ].join("\n");
}

function buildRelayDestinationIntroduction(): string {
  return [
    `🦆 Oi, pessoal! Eu sou o ${PERSONA_NAME}, mascote e sentinela da Comunidade FullDev.`,
    "",
    "Vou funcionar assim por aqui:",
    "",
    "• Sempre que os professores ou os representantes de eixo divulgarem um evento, palestra, edital ou oportunidade, eu trago um resumo para cá.",
    "• O resumo mantém o que importa: data, horário, local, link e prazo de inscrição.",
    "• Se algum dado não estiver no anúncio original, eu não invento — na dúvida, confirmem com a coordenação ou com o representante do eixo de vocês.",
    "",
    // No "tag me and I'll answer" line here on purpose: the mention-reply listener only runs in
    // the networking groups, so promising it in this one would be a promise the bot cannot keep.
    "Por enquanto é só isso que eu faço neste grupo — não respondo mensagens por aqui.",
    "",
    COMMUNITY_CONTEXT
  ].join("\n");
}

// Inside the community everyone already knows what FullDev is, so pitching it back at them is
// noise; outside it, the introduction is the whole point - the bot is a guest and should say who
// it is and where it comes from.
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

export function buildGroupIntroduction(role: GroupRole): string {
  switch (role) {
    case "relay_source":
      return buildRelaySourceIntroduction();
    case "relay_destination":
      return buildRelayDestinationIntroduction();
    case "community":
      return buildInternalIntroduction();
    case "external":
      return buildExternalIntroduction();
  }
}
