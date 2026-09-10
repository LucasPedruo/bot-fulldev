import { buildMentionTag } from "../shared/mentions.js";

const languages = ["JavaScript", "TypeScript", "Python", "Java", "PHP", "Ruby", "Go", "Rust", "C#", "Kotlin", "Swift", "C++"];
const frameworks = ["React", "Angular", "Vue", "Django", "Spring", "Rails", "Laravel", "Express", "Next.js", "Flutter"];
const temas = [
  "microsserviços",
  "clean code",
  "TDD",
  "CI/CD",
  "Docker",
  "Kubernetes",
  "IA generativa",
  "code review",
  "dívida técnica",
  "regex"
];

const mentionReplyTemplates: Array<() => string> = [
  () => `Presente! Só aqui pensando em ${pickOne(temas)}, como sempre.`,
  () => `Fui chamado! Alguém precisa de ajuda pra debugar a vida?`,
  () => `Só um bot tentando entender por que ${pickOne(languages)} faz isso.`,
  () => `Aqui! Ocupado defendendo ${pickOne(languages)} de mais um hater.`,
  () => `Chamaram? Eu tava só olhando a documentação do ${pickOne(frameworks)} de novo.`,
  () => `Presente e funcionando (por enquanto).`,
  () => `Fui invocado! Alguém aí sabe centralizar uma div sem sofrer?`,
  () => `Tô aqui, mas minha atenção tá 100% em ${pickOne(temas)} hoje.`,
  () => `Chamaram o bot! Infelizmente não faço deploy, só converso.`,
  () => `Presente! Orgulho danado de fazer parte da FullDev.`
];

export function pickMentionReply(): string {
  return pickOne(mentionReplyTemplates)();
}

const mentionCooldownTemplates: Array<(hours: number) => string> = [
  (hours) => `Ok, chega de me chamar por hoje. Modo silêncio ativado por ${hours}h — tentem sobreviver sem mim.`,
  (hours) => `Atingi minha cota de besteira por hora. Volto a responder em ${hours}h, se é que vão sentir minha falta.`,
  (hours) => `Tô sendo abusado(a) com marcação. Só respondo de novo daqui a ${hours}h.`,
  (hours) => `Isso já virou spam. Bot de férias por ${hours}h, jurando por essa.`,
  (hours) => `Ok, vocês exageraram. Não respondo mais nenhuma menção pelas próximas ${hours}h.`
];

export function pickMentionCooldownMessage(hours: number): string {
  return pickOne(mentionCooldownTemplates)(hours);
}

const welcomeTemplates: Array<(tags: string) => string> = [
  (tags) =>
    `Bem-vindo(a), ${tags}! Você agora faz parte oficialmente da nossa seita secreta de devs da FullDev. Leia as regras do grupo antes de mandar a primeira mensagem.`,
  (tags) =>
    `${tags} chegou! A partir de agora você é membro oficial da seita secreta de devs da FullDev. Leia as regras antes que alguém te cobre.`,
  (tags) =>
    `Seja bem-vindo(a), ${tags}. Iniciação concluída: você faz parte da nossa seita secreta de devs da FullDev. Passo 1: ler as regras do grupo.`,
  (tags) => `${tags}, parabéns, você foi selecionado(a) para a seita secreta de devs da FullDev. Leia as regras antes que seja tarde demais.`
];

export function buildWelcomeMessage(participantJids: string[]): { text: string; mentions: string[] } {
  const tags = participantJids.map(buildMentionTag).join(" ");
  return { text: pickOne(welcomeTemplates)(tags), mentions: participantJids };
}

// Full-group notice: the group is at WhatsApp's ceiling and people are still queued to join.
// The point is to make the slot feel costly - whoever leaves loses it to the next person in line.
const waitlistNoticeTemplates: Array<(pending: number) => string> = [
  (pending) =>
    `Aviso do sentinela: o grupo está lotado e tem ${describePending(pending)} na lista de espera querendo entrar. Se você sair, perde a vaga e ela vai direto para a próxima pessoa da fila.`,
  (pending) =>
    `Grupo no limite! Tem ${describePending(pending)} esperando uma vaga aqui. Quem sair, perde o lugar - e não dá para reservar.`,
  (pending) =>
    `Lotação máxima atingida. ${capitalize(describePending(pending))} está na fila de espera. Saiu, perdeu: a vaga passa para o próximo automaticamente.`
];

export function buildWaitlistNoticeMessage(pendingCount: number): string {
  return pickOne(waitlistNoticeTemplates)(pendingCount);
}

function describePending(pending: number): string {
  return pending === 1 ? "1 pessoa" : `${pending} pessoas`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pickOne<T>(items: readonly T[]): T {
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}
