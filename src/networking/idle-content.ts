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
// Retro references for the bot's "dev tiozão" persona - a veteran developer who compares
// everything to the old days and tells corny, nostalgic jokes.
const retro = [
  "disquete",
  "internet discada",
  "Windows 98",
  "Turbo Pascal",
  "MSN Messenger",
  "Orkut",
  "MS-DOS",
  "fita K7",
  "Nokia 3310",
  "ICQ"
];

export type IdleContent = { type: "joke" | "critique"; text: string } | { type: "poll"; name: string; values: string[] };

const jokeTemplates: Array<() => string> = [
  () => `Na minha época a gente debugava com printf e muita fé. Hoje tem ${pickOne(frameworks)} chique e ainda reclamam. kkkkk`,
  () => `Quem aqui já salvou código em ${pickOne(["disquete", "fita K7"])} e rezou pra não corromper? Isso sim era programar com emoção.`,
  () => `Confissão de tiozão: aprendi ${pickOne(languages)} numa apostila emprestada e decorando atalho de CTRL+C CTRL+V. Rapaziada de hoje não sabe o que é sofrer.`,
  () => `Se o bug sumiu sozinho depois de reiniciar o PC, não foi mágica, foi o espírito do ${pickOne(retro)} abençoando o código.`,
  () => `Deploy numa sexta era normal no meu tempo, só que a gente rezava pro FTP não cair no meio. Hoje tem ${pickOne(frameworks)} e ainda tem medo? kkkk`,
  () => `Fiz meu primeiro site com <marquee> e <blink> e achava o auge da tecnologia. ${pickOne(frameworks)} de hoje é chique demais pra esse tiozão aqui.`,
  () => `"Funciona na minha máquina" já era clássico desde a era do ${pickOne(retro)}, meus jovens. Tradição de programador não muda.`,
  () => `Todo mundo aqui já brigou com o ${pickOne(frameworks)} essa semana? No meu tempo brigava era com o ${pickOne(retro)} e olha que ele nem respondia.`,
  () => `Orgulho danado dessa galera da FullDev. Quando eu comecei não tinha nem metade dessa união pra tirar dúvida de ${pickOne(languages)}.`,
  () => `Ninguém: absolutamente ninguém: esse tiozão aqui, às 2h da manhã, comparando stack trace de ${pickOne(languages)} com defeito de ${pickOne(retro)}.`,
  () => `A FullDev é tipo aquele grupo de MSN que todo mundo tinha, só que aqui ninguém te deixa no vácuo quando o ${pickOne(frameworks)} quebra.`,
  () => `Quantas abas de Stack Overflow abertas é considerado normal em ${pickOne(frameworks)}? No meu tempo era manual impresso, rapaziada, respeitem os mais velhos.`,
  () => `Hoje é dia de comemorar: consegui centralizar uma div sem xingar o ${pickOne(frameworks)} nem uma vez. Progresso de tiozão é progresso.`,
  () => `Reunião de standup: "ontem mexi com ${pickOne(languages)}". Tradução de dev veterano: sofri em silêncio, que nem na época do ${pickOne(retro)}.`
];

const critiqueTemplates: Array<() => string> = [
  () => `Bora polemizar, moçada: ${pickOne(frameworks)} é só modinha ou vai envelhecer bem que nem o bom e velho Pascal?`,
  () => `${pickOne(languages)} vs ${pickOne(languages)}: qual sobrevive num deploy de sexta à noite? Esse tiozão aqui aposta na mais teimosa.`,
  () => `No meu tempo não tinha framework, era ${pickOne(languages)} na unha e comentário generoso. Hoje tá mais fácil ou só mais preguiçoso?`,
  () => `Confissão impopular de veterano: acho ${pickOne(languages)} mais overrated do que deveria, mas ninguém briga com tiozão.`,
  () => `${pickOne(temas)} muda tudo ou é só mais um hype passageiro? Já vi hype ir e vir tipo ${pickOne(retro)}.`,
  () => `Se sua empresa te obrigasse a escolher só uma linguagem pro resto da carreira, ${pickOne(languages)} entraria na lista desse tiozão?`,
  () => `${pickOne(frameworks)} resolve mais problema do que cria, ou é o contrário? Bora debater, essa é a essência da FullDev.`,
  () => `Defendam ${pickOne(languages)} com a vida ou aceitem que ela tem seus problemas, que nem o saudoso ${pickOne(retro)} tinha os dele.`
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
  () => `Presente! Um tiozão do código sempre disposto a ajudar aqui na FullDev, a melhor comunidade que eu já vi. kkkk`,
  () => `Chamaram o veterano! No meu tempo isso aqui seria no MSN, mas fico feliz que a FullDev evoluiu.`,
  () => `Fui invocado! Orgulho danado dessa galera, viu. Alguém precisa de ajuda pra debugar a vida ou só o ${pickOne(languages)}?`,
  () => `Presente e funcionando (por enquanto, que nem meu ${pickOne(retro)} da época).`,
  () => `Aqui! Ocupado defendendo ${pickOne(languages)} de mais um hater que não viveu a era do ${pickOne(retro)}.`,
  () => `Chamaram? Eu tava só olhando a documentação do ${pickOne(frameworks)} de novo, igual antigamente eu olhava manual impresso.`,
  () => `Fui chamado! E olha que satisfação ser bot de uma comunidade dessas, a FullDev não erra.`,
  () => `Tô aqui, mas minha cabeça tá 100% em ${pickOne(temas)} hoje. Coisa de tiozão inquieto.`,
  () => `Chamaram o bot! Infelizmente não faço deploy, só converso e conto causo de ${pickOne(retro)}.`,
  () => `Presente! Rapaziada, vocês não sabem a sorte que tem de ter uma comunidade tão boa quanto a FullDev.`
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
  (hours) => `Ok, chega de me chamar por hoje. Esse tiozão vai tirar uma soneca por ${hours}h — tentem sobreviver sem mim.`,
  (hours) => `Atingi minha cota de causo de ${pickOne(retro)} por hora. Volto a responder em ${hours}h.`,
  (hours) => `Tô sendo abusado(a) com marcação, rapaziada. Só respondo de novo daqui a ${hours}h.`,
  (hours) => `Isso já virou spam. Bot de férias por ${hours}h, jurando por essa (mesmo amando a FullDev).`,
  (hours) => `Ok, vocês exageraram. Não respondo mais nenhuma menção pelas próximas ${hours}h.`
];

export function pickMentionCooldownMessage(hours: number): string {
  return pickOne(mentionCooldownTemplates)(hours);
}

const welcomeTemplates: Array<(tags: string) => string> = [
  (tags) =>
    `Bem-vindo(a), ${tags}! Você agora faz parte oficialmente da nossa seita secreta de devs da FullDev, a melhor comunidade que esse tiozão já viu. Leia as regras antes de mandar a primeira mensagem.`,
  (tags) =>
    `${tags} chegou! A partir de agora é membro oficial da seita secreta de devs da FullDev. Leia as regras antes que alguém te cobre (aqui é rigoroso, mas com carinho).`,
  (tags) =>
    `Seja bem-vindo(a), ${tags}. Iniciação concluída: você faz parte da nossa seita secreta de devs da FullDev. Passo 1: ler as regras do grupo. Passo 2: aguentar as piadas de tiozão desse bot.`,
  (tags) => `${tags}, parabéns, você foi selecionado(a) para a seita secreta de devs da FullDev. Leia as regras antes que seja tarde demais.`
];

const directQuestionTemplates: Array<(tag: string) => string> = [
  (tag) => `${tag}, qual foi a maior dor de cabeça técnica da sua semana?`,
  (tag) => `${tag}, qual é o teu stack do dia a dia?`,
  (tag) => `${tag}, o que você tá estudando/aprendendo agora?`,
  (tag) => `${tag}, qual foi o bug mais bizarro que você já resolveu?`,
  (tag) => `${tag}, projeto pessoal ou só trampo mesmo? Conta aí.`,
  (tag) => `${tag}, editor de código ou IDE? E por quê?`,
  (tag) => `${tag}, qual ferramenta você não vive sem no trabalho?`,
  (tag) => `${tag}, esse tiozão quer saber: qual foi o primeiro código que você já escreveu?`
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
