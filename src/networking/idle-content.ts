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

export type IdleContent = { type: "joke" | "critique"; text: string } | { type: "poll"; name: string; values: string[] };

const jokeTemplates: Array<() => string> = [
  () => `Confissão do dia: ainda confundo ${pickOne(languages)} com ${pickOne(languages)} quando tô com sono.`,
  () => `Todo mundo aqui já brigou com o ${pickOne(frameworks)} pelo menos uma vez essa semana, né?`,
  () => `PSA: se o bug sumiu sozinho depois de um print, não foi mágica, foi ${pickOne(languages)} sendo ${pickOne(languages)}.`,
  () => `Hoje decidi que ${pickOne(temas)} é responsável por 90% dos meus problemas. Concordam?`,
  () => `Quem mais acha que ${pickOne(frameworks)} deveria vir com aviso "leia a documentação 3 vezes antes de usar"?`,
  () => `"Funciona na minha máquina" é a frase mais usada em ${pickOne(languages)} e a menos confiável do universo.`,
  () => `Nível de confiança ao fazer deploy numa sexta usando ${pickOne(frameworks)}: 0%.`,
  () => `Alguém mais acha ${pickOne(temas)} mais fácil de explicar que de aplicar de verdade?`,
  () => `Se ${pickOne(languages)} fosse pessoa, já teria brigado com ${pickOne(languages)} pelo menos uma vez hoje.`,
  () => `Debugar ${pickOne(frameworks)} às vezes parece arqueologia: cada camada revela um mistério novo.`,
  () => `Ninguém: absolutamente ninguém: eu, às 2h da manhã, tentando entender uma stack trace de ${pickOne(languages)}.`,
  () => `${pickOne(temas)} é tipo academia: todo mundo fala que devia fazer mais.`,
  () => `Quantas abas do Stack Overflow abertas é considerado normal quando se mexe com ${pickOne(frameworks)}?`,
  () => `Hoje é dia de comemorar: consegui centralizar uma div sem culpar o ${pickOne(frameworks)}.`,
  () => `Reunião de standup: "ontem mexi com ${pickOne(languages)}". Tradução: sofri em silêncio.`
];

const critiqueTemplates: Array<() => string> = [
  () => `Bora polemizar: ${pickOne(languages)} é subestimada ou só eu acho isso?`,
  () => `${pickOne(languages)} vs ${pickOne(languages)}: qual sobrevive num deploy de sexta à noite?`,
  () => `Defendam ${pickOne(languages)} com a vida ou aceitem que ela tem seus problemas. Debate aberto.`,
  () => `${pickOne(frameworks)} envelheceu bem ou já era hora de aposentar?`,
  () => `Confissão impopular: acho ${pickOne(languages)} mais overrated do que deveria.`,
  () => `${pickOne(temas)} muda tudo ou é só mais um hype passageiro?`,
  () => `Se sua empresa te obrigasse a escolher só uma linguagem pro resto da carreira, ${pickOne(languages)} entraria na lista?`,
  () => `${pickOne(frameworks)} resolve mais problema do que cria, ou é o contrário?`
];

const pollTemplates: Array<() => { name: string; values: string[] }> = [
  () => ({ name: "Qual dessas vocês usariam num projeto novo hoje?", values: sampleN(languages, 4) }),
  () => ({ name: "Framework mais sofrido de debugar:", values: sampleN(frameworks, 4) }),
  () => ({ name: `${pickOne(temas)}: essencial ou modinha?`, values: ["Essencial", "Modinha", "Depende do projeto", "Nunca usei"] }),
  () => ({ name: "Deploy na sexta-feira à tarde:", values: ["Sempre", "Só se for urgente", "Nunca", "Só se ninguém contar"] }),
  () => ({ name: "Code review: prefere qual estilo?", values: ["Direto e curto", "Detalhado com contexto", "Só aprovo e rezo", "Depende do humor"] }),
  () => ({ name: "Onde vocês procuram solução de bug primeiro?", values: ["Documentação", "Stack Overflow", "IA", "Tentativa e erro"] }),
  () => ({ name: "Qual dessas linguagens vocês evitariam num projeto novo?", values: sampleN(languages, 4) }),
  () => ({ name: "Reunião podia ter sido:", values: ["Um e-mail", "Uma mensagem no grupo", "Nada", "Foi produtiva mesmo"] })
];

const mentionReplyTemplates: Array<() => string> = [
  () => `Eu? Só aqui pensando em ${pickOne(temas)}, como sempre.`,
  () => `Presente! E antes que perguntem: não, eu não sei corrigir esse bug de sexta-feira.`,
  () => `Fui chamado! Alguém precisa de ajuda pra debugar a vida?`,
  () => `Só um bot tentando entender por que ${pickOne(languages)} faz isso.`,
  () => `Aqui! Ocupado defendendo ${pickOne(languages)} de mais um hater.`,
  () => `Chamaram? Eu tava só olhando a documentação do ${pickOne(frameworks)} de novo.`,
  () => `Presente e funcionando (por enquanto).`,
  () => `Fui invocado! Alguém aí sabe centralizar uma div sem sofrer?`,
  () => `Tô aqui, mas minha atenção tá 100% em ${pickOne(temas)} hoje.`,
  () => `Chamaram o bot! Infelizmente não faço deploy, só converso.`
];

export function pickIdleContent(recentlyUsed: string[] = []): IdleContent {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateOnce();
    const key = candidate.type === "poll" ? candidate.name : candidate.text;

    if (!recentlyUsed.includes(key)) {
      return candidate;
    }
  }

  return generateOnce();
}

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
    `Bem-vindo(a), ${tags}! Você agora faz parte oficialmente da nossa seita secreta de devs. Leia as regras do grupo antes de mandar a primeira mensagem.`,
  (tags) =>
    `${tags} chegou! A partir de agora você é membro oficial da seita secreta de devs deste grupo. Leia as regras antes que alguém te cobre.`,
  (tags) =>
    `Seja bem-vindo(a), ${tags}. Iniciação concluída: você faz parte da nossa seita secreta de devs. Passo 1: ler as regras do grupo.`,
  (tags) => `${tags}, parabéns, você foi selecionado(a) para a seita secreta de devs. Leia as regras antes que seja tarde demais.`
];

const directQuestionTemplates: Array<(tag: string) => string> = [
  (tag) => `${tag}, qual foi a maior dor de cabeça técnica da sua semana?`,
  (tag) => `${tag}, qual é o teu stack do dia a dia?`,
  (tag) => `${tag}, o que você tá estudando/aprendendo agora?`,
  (tag) => `${tag}, qual foi o bug mais bizarro que você já resolveu?`,
  (tag) => `${tag}, projeto pessoal ou só trampo mesmo? Conta aí.`,
  (tag) => `${tag}, editor de código ou IDE? E por quê?`,
  (tag) => `${tag}, qual ferramenta você não vive sem no trabalho?`
];

export function pickDirectQuestion(participantJid: string): { text: string; mentions: string[] } {
  const tag = `@${participantJid.split("@")[0]}`;
  return { text: pickOne(directQuestionTemplates)(tag), mentions: [participantJid] };
}

export function buildWelcomeMessage(participantJids: string[]): { text: string; mentions: string[] } {
  const tags = participantJids.map((jid) => `@${jid.split("@")[0]}`).join(" ");
  return { text: pickOne(welcomeTemplates)(tags), mentions: participantJids };
}

const goodbyeTemplates = [
  "Puxa, não foi dessa vez que você conseguiu, mas não desista. Ligue somente durante o programa...",
  "Saiu, perdeu o sorteio do HB20.",
  "Esse foi de Vasco.",
  "Menos um pra competir na vaga de júnior.",
  "Foi um prazer, ou não. Baita call.",
  "Mais um que preferiu produção sem testes.",
  "Partiu sem dar merge na branch. Descanse em paz.",
  "Deletou a conta com a mesma coragem de quem faz force push na main."
];

export function pickGoodbyeMessage(): string {
  return pickOne(goodbyeTemplates);
}

function generateOnce(): IdleContent {
  const type = pickOne(["joke", "critique", "poll"] as const);

  if (type === "poll") {
    const { name, values } = pickOne(pollTemplates)();
    return { type: "poll", name, values };
  }

  const templates = type === "joke" ? jokeTemplates : critiqueTemplates;
  return { type, text: pickOne(templates)() };
}

function pickOne<T>(items: readonly T[]): T {
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

function sampleN<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  const result: T[] = [];

  while (result.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(index, 1)[0]);
  }

  return result;
}
