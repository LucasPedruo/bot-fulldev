export type SpotlightSlot = "morning" | "lunch" | "night";

const morningTemplates = [
  "Bom dia! Hoje quem abre o papo é {tag}. Bora contar no que está trabalhando hoje?",
  "{tag}, bom dia! Puxa um assunto de tech pra galera começar o dia?",
  "Café tomado? {tag}, hoje é sua vez de dar um oi pro grupo.",
  "Bom dia, pessoal! {tag} foi sorteado(a) pra abrir a conversa hoje.",
  "{tag}, começando o dia: o que você tá estudando ou aprendendo essa semana?"
];

const lunchTemplates = [
  "{tag}, hora do almoço: manda uma recomendação (série, livro, o que for) pra galera.",
  "Pausa pro meio-dia! {tag}, conta uma dica rápida de produtividade ou de código.",
  "{tag}, já almoçou? Aproveita e conta uma curiosidade de tech pro grupo.",
  "Meio-dia chegou. {tag}, qual foi o maior desafio técnico da sua semana até agora?",
  "{tag}, puxa assunto: qual ferramenta você não vive sem no trabalho?"
];

const nightTemplates = [
  "{tag}, fechando o dia: rolou alguma vitória (grande ou pequena) hoje?",
  "Boa noite! {tag}, o que você aprendeu de novo hoje?",
  "{tag}, resumo da noite: o que ficou de tarefa pra amanhã?",
  "Encerrando o dia com {tag}: teve algum bug memorável hoje?",
  "{tag}, antes de desligar: alguma dica pra quem tá começando na área?"
];

const mondayTemplates = [
  "Começando a semana com o pé direito! {tag}, qual sua meta técnica pra essa semana?",
  "{tag}, segunda-feira: bora contar o que pretende aprender ou entregar essa semana?",
  "Semana nova, {tag}! Conta um desafio que você quer encarar essas próximos dias.",
  "{tag}, motivação de segunda: qual foi a última coisa que te ensinou algo novo?"
];

const fridayTemplates = [
  "Sextou, {tag}! Conta uma vitória da semana antes do fim de semana chegar.",
  "{tag}, fechando a semana: o que rolou de mais interessante essa semana?",
  "Sexta-feira, {tag}! Alguma recomendação pra maratonar no fim de semana?",
  "{tag}, última do dia antes do fim de semana: o que você faria diferente essa semana?"
];

const templatesBySlot: Record<SpotlightSlot, string[]> = {
  morning: morningTemplates,
  lunch: lunchTemplates,
  night: nightTemplates
};

export function pickSpotlightMessage(slot: SpotlightSlot, tag: string, weekday: number): string {
  const pool = weekday === 1 ? mondayTemplates : weekday === 5 ? fridayTemplates : templatesBySlot[slot];
  return pickOne(pool).replace("{tag}", tag);
}

export type DailySummaryInput = {
  jobsToday: number;
  messagesToday: number;
  joinedToday: number;
  leftToday: number;
  weekday: number;
};

export function buildDailySummary(input: DailySummaryInput): string {
  const intro =
    input.weekday === 1
      ? "Começando a semana, aqui vai o resumo de hoje:"
      : input.weekday === 5
        ? "Fechando a semana, aqui vai o resumo de hoje:"
        : "Resumo do dia por aqui:";

  return [
    intro,
    "",
    `Vagas novas hoje: ${input.jobsToday}`,
    `Mensagens trocadas no grupo: ${input.messagesToday}`,
    `Pessoas que entraram: ${input.joinedToday}`,
    `Pessoas que saíram: ${input.leftToday}`
  ].join("\n");
}

function pickOne<T>(items: readonly T[]): T {
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}
