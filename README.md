# FullDev WhatsApp Bot

Fundacao do bot automatizado da comunidade FullDev. A base atual entrega Node.js + TypeScript, Fastify, Pino, Zod, PostgreSQL, Drizzle ORM, Docker e integracao inicial com WhatsApp via Baileys.

Ainda nao foram implementados vagas, eventos ou networking. Esses modulos entram nas fases seguintes.

## Requisitos

- Node.js 22+
- Docker
- Docker Compose

## Configuracao local

1. Crie o arquivo de ambiente local:

```bash
cp .env.example .env.local
```

2. Para rodar scripts fora do Docker e usar o Postgres do Compose, mantenha no `.env.local`:

```env
DATABASE_URL=postgres://fulldev:fulldev@localhost:5432/fulldev_bot
```

3. Para producao, crie um `.env` no servidor com valores reais. Nao versionar `.env`, `.env.local`, credenciais do WhatsApp ou dumps do banco.

No Docker Compose local, a aplicacao usa `postgres` como host interno automaticamente:

```env
DATABASE_URL=postgres://fulldev:fulldev@postgres:5432/fulldev_bot
```

## Comandos

Instalar dependencias:

```bash
npm install
```

Rodar em desenvolvimento:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

Typecheck:

```bash
npm run typecheck
```

Testes:

```bash
npm test
```

Gerar migrations Drizzle:

```bash
npm run db:generate
```

Executar migrations:

```bash
npm run db:migrate
```

Ao iniciar a aplicacao, as migrations tambem sao aplicadas automaticamente antes do worker da fila subir. O comando manual continua util em desenvolvimento e troubleshooting.

## Docker

Subir Postgres e aplicacao:

```bash
docker compose up --build
```

Ver logs:

```bash
docker compose logs -f app
```

Parar:

```bash
docker compose down
```

Os volumes `postgres_data` e `whatsapp_auth` preservam dados do banco e futura sessao do WhatsApp.

## Grupos

O bot espera oito grupos configuraveis:

```env
WHATSAPP_JOBS_GROUP_1=
WHATSAPP_JOBS_GROUP_2=
WHATSAPP_FACULTY_JOBS_GROUP=
WHATSAPP_EVENTS_GROUP=
WHATSAPP_NETWORKING_GROUP_1=
WHATSAPP_NETWORKING_GROUP_2=
WHATSAPP_EIXO_REPRESENTATIVES_GROUP=
WHATSAPP_FACULTY_EVENTS_GROUP=
```

`WHATSAPP_NETWORKING_GROUP` ainda existe como alias legado para o primeiro grupo de networking.

`WHATSAPP_FACULTY_JOBS_GROUP` e o grupo de vagas de uma faculdade parceira — recebe as mesmas vagas que `JOBS_GROUP_1`/`JOBS_GROUP_2` (`JobService.enqueueJobToJobsGroups`, `src/jobs/job.service.ts`), com uma linha extra convidando pra conhecer a comunidade FullDev (`formatJobMessageForFaculty`, `src/jobs/job.formatter.ts`), mas **filtradas para estagio/junior apenas** (`job.level === "intern" || "junior"`) — publico em inicio de carreira, entao vagas de pleno/senior ou sem nivel classificado nunca vao pra esse grupo. O grupo tambem responde `@bot vagas de junior frontend` do mesmo jeito que os outros dois grupos de vagas.

## WhatsApp

A integracao usa Baileys (`@whiskeysockets/baileys`). A sessao fica persistida em `data/whatsapp` localmente ou no volume Docker `whatsapp_auth`.

Por padrao, `BAILEYS_LOG_LEVEL=warn` reduz logs internos da biblioteca para evitar despejar detalhes de sessao. Os logs principais do bot continuam em `LOG_LEVEL`.

Ao iniciar a aplicacao com `WHATSAPP_AUTO_CONNECT=true`, o bot tenta conectar ao WhatsApp. Se nao houver sessao salva, um QR code aparece nos logs:

```bash
docker compose logs -f app
```

Escaneie o QR com o numero dedicado do bot. Sempre que possivel, a sessao sera reutilizada nos proximos restarts.

Para gerar codigo de pareamento em vez de QR, configure no `.env`:

```env
WHATSAPP_PAIRING_PHONE_NUMBER=5511999999999
```

Listar grupos e JIDs:

```bash
npm run whatsapp:list-groups
```

Enviar mensagem manual de teste:

```bash
npm run whatsapp:send-test -- 120363000000000000@g.us "Teste do bot FullDev"
```

Esses comandos locais leem `.env.local` e usam a sessao em `data/whatsapp`. Se o pareamento foi feito pelo container, use os scripts compilados dentro do Docker para aproveitar o volume `whatsapp_auth`:

```bash
docker compose exec app node dist/whatsapp/cli/list-groups.js
docker compose exec app node dist/whatsapp/cli/send-test.js 120363000000000000@g.us "Teste do bot FullDev"
```

### Mencoes e LID

WhatsApp identifica participantes de duas formas: o JID de telefone (`...@s.whatsapp.net`) ou o **LID** (`...@lid`, um identificador mais novo, independente do numero) — qual delas aparece depende do modo de endereçamento do grupo. Isso gerou dois bugs reais ja corrigidos neste projeto:

1. **Detectar quando o bot e mencionado** (`isBotMentioned`, `src/shared/mentions.ts`): o campo `mentionedJid` de uma mensagem recebida pode trazer o LID do bot em vez do JID de telefone — por isso toda comparacao "isso e o bot?" verifica as duas formas (`getBotJids` retorna `[user?.id, user?.lid]`).
2. **Construir uma mencao de saida** (responder marcando alguem, dar boas-vindas, sortear participante): o `participant.id` que a Baileys devolve pode vir em formato LID. Usar esse LID direto pra montar o texto "`@numero`" faz a mencao aparecer como **texto puro, sem virar link** no WhatsApp — o cliente so resolve o nome de contato a partir do numero de telefone de verdade. `resolvePhoneJid`/`resolvePhoneJids` (`src/shared/mentions.ts`) resolvem um LID pro JID de telefone correspondente usando o mapeamento que a propria Baileys mantem (`socket.signalRepository.lidMapping.getPNForLID`), com fallback pro LID original se ainda nao houver mapeamento conhecido. Esse resolve acontece uma unica vez, na fonte do dado (`WhatsAppConnectionManager.listParticipants`, e na extracao do remetente/participantes em `message-listener.ts`/`membership-listener.ts`), entao todo o resto do codigo (spotlight, pergunta direta, boas-vindas, resposta de mencao, "quem vai" do evento) ja recebe JIDs corretos sem precisar saber desse detalhe.

## Fila

Toda mensagem automatica deve passar pela fila persistida no PostgreSQL. O worker processa uma mensagem por vez e respeita `MESSAGE_INTERVAL_SECONDS`.

Enfileirar uma mensagem manual de teste:

```bash
npm run queue:enqueue-test -- 120363000000000000@g.us "Teste pela fila"
```

Enfileirar para o futuro, sem disparar imediatamente:

```bash
npm run queue:enqueue-test -- 120363000000000000@g.us "Teste agendado" --delay-seconds=3600
```

Dentro do Docker:

```bash
docker compose exec app node dist/queue/cli/enqueue-test.js 120363000000000000@g.us "Teste pela fila"
```

O worker marca envios como `sent`, reagenda falhas enquanto houver tentativas disponiveis e marca como `failed` ao atingir `MESSAGE_MAX_RETRIES`. Mensagens que ficaram presas em `processing` por tempo excessivo voltam para `pending` no startup.

## Vagas

A Fase 4 comeca com Jobicy e Remotive, depois ganhou RemoteOK, Arbeitnow e Himalayas. Jobicy fica habilitado no fluxo principal; os demais foram implementados, mas ficam desabilitados por padrao ate confirmar limites e volume de cada API.

Jobicy, Remotive, RemoteOK e Arbeitnow sao boards internacionais (Arbeitnow e focado em vagas na Alemanha/Europa). Nenhum tem foco no Brasil. LinkedIn foi avaliado e descartado: nao existe API publica de vagas (o acesso oficial exige status de parceiro Talent Solutions, restrito a empresas) e fazer scraping da busca de vagas viola os Termos de Uso do LinkedIn, alem de ser bloqueado rapidamente na pratica (rate limit, CAPTCHA, banimento de conta/IP).

Himalayas (`himalayas.app`) cobre o foco em vagas brasileiras: a API oficial e publica, sem cadastro, e o endpoint de busca aceita `country=Brazil` (retorna vagas restritas ao Brasil e vagas mundiais sem restricao de pais) e `seniority=Entry-level,Mid-level` (equivalente a estagio/junior + pleno, excluindo senior/lead/gerencia). Os termos de uso pedem apenas atribuicao visivel ao himalayas.app, que ja e satisfeita porque a propria URL da vaga aponta para o himalayas.app.

```text
GET https://jobicy.com/api/v2/remote-jobs
```

Remotive:

```text
GET https://remotive.com/api/remote-jobs
```

RemoteOK (o primeiro item do array e um aviso legal, nao uma vaga; a API pede para linkar de volta ao RemoteOK e nao usar a logo sem permissao):

```text
GET https://remoteok.com/api
```

Arbeitnow (paginado em `data`, filtramos por `remote=true`):

```text
GET https://arbeitnow.com/api/job-board-api
```

Himalayas (paginado por `page`, ate 5 paginas por rodada de poll):

```text
GET https://himalayas.app/jobs/api/search?country=Brazil&seniority=Entry-level,Mid-level
```

Greenhouse (um board publico por empresa, sem busca entre empresas — `GREENHOUSE_BOARD_SLUGS` lista os boards, um por vez):

```text
GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
```

Cada slug em `GREENHOUSE_BOARD_SLUGS` foi confirmado manualmente como o board publico real de uma empresa brasileira de tech (Nubank, Stone, QuintoAndar, Gympass, EBANX, Wildlife Studios, VTEX, RD Station, Banco Inter, C6 Bank). Gupy e Glassdoor foram avaliados e descartados: a API publica da Gupy e so para a propria empresa gerenciar suas vagas (token da empresa, sem busca agregada — mesmo problema do LinkedIn), e a API publica do Glassdoor foi descontinuada em 2021 (hoje e so parceria paga). Itau, iFood e Mercado Livre nao usam Greenhouse nem Lever, entao nao aparecem aqui — precisariam de investigacao individual do ATS que cada uma usa.

Sem um campo de nivel estruturado (diferente do `seniority` do Himalayas), o Greenhouse so inclui uma vaga quando o **titulo** menciona estagio/junior/pleno explicitamente — vagas ambiguas (sem nenhuma palavra de nivel no titulo) ficam de fora por seguranca, mesmo que pudessem ser junior/pleno na pratica. Diferente dos outros 4 providers, o Greenhouse nao filtra por remoto: cada board e de uma empresa brasileira especifica, entao vagas hibridas/presenciais tambem entram (o campo `remote` reflete o texto da localizacao; a mensagem so mostra "Remoto" quando for de fato remoto).

Nenhuma dessas 5 APIs expoe um filtro de categoria "tech" confiavel (RemoteOK, Arbeitnow e Greenhouse nao tem categoria nenhuma; o `parentCategories` do Himalayas fica vazio mesmo em vagas claramente tecnicas), entao o provider filtra localmente pelo **titulo** da vaga com tecnologias conhecidas e palavras-chave de cargo (developer/desenvolvedor, engineer/engenheiro, devops, qa, etc. — Himalayas e Greenhouse usam palavras-chave em portugues tambem). Tags e descricao nao entram nessa decisao porque sao texto livre e geram falsos positivos (ex.: tag "react" numa vaga de gerente de loja no RemoteOK, "engineering" mencionado na descricao de uma vaga de suporte no Arbeitnow).

Sem cuidado, um provider com bug ou uma API com volume inesperado poderia postar mensagens sem parar (o unico controle antes era o intervalo de 5 minutos entre polls, sem teto algum). `JOBS_MAX_PER_DAY` (padrao 15) limita quantas vagas **novas** podem ser descobertas por dia civil (contagem por `discoveredAt`, reseta a meia-noite no fuso configurado em `TZ`); ao atingir o limite o poll seguinte nem chega a chamar os providers, so registra um log e sai. O limite conta vagas distintas, nao mensagens (cada vaga ainda vai para os 2 grupos de vagas).

Em desenvolvimento local, o foco atual do bot e vagas brasileiras estagio/junior/pleno, entao o Jobicy (internacional, sem filtro de nivel) fica desabilitado em producao junto com Remotive/RemoteOK/Arbeitnow, deixando so o Himalayas ativo, com contagem baixa:

```env
JOBS_POLL_ENABLED=true
JOBS_MAX_PER_DAY=15
JOBICY_JOBS_ENABLED=false
JOBICY_JOBS_COUNT=50
HIMALAYAS_JOBS_ENABLED=true
HIMALAYAS_JOBS_COUNT=5
REMOTIVE_JOBS_ENABLED=false
REMOTIVE_JOBS_COUNT=20
REMOTEOK_JOBS_ENABLED=false
REMOTEOK_JOBS_COUNT=20
ARBEITNOW_JOBS_ENABLED=false
ARBEITNOW_JOBS_COUNT=20
GREENHOUSE_JOBS_ENABLED=false
GREENHOUSE_JOBS_COUNT=20
GREENHOUSE_BOARD_SLUGS=nubank,stone,quintoandar,gympass,ebanx,wildlifestudios,vtex,rdstation,inter,c6bank
JOBS_POLL_INTERVAL_MINUTES=5
```

Validar Jobicy e formatacao sem salvar/enfileirar:

```bash
npm run jobs:poll -- --dry-run
```

Validar os demais providers sem salvar/enfileirar:

```bash
npm run jobs:poll -- --dry-run --provider=remotive
npm run jobs:poll -- --dry-run --provider=remoteok
npm run jobs:poll -- --dry-run --provider=arbeitnow
npm run jobs:poll -- --dry-run --provider=himalayas
npm run jobs:poll -- --dry-run --provider=greenhouse
```

Rodar polling real manualmente:

```bash
npm run jobs:poll
```

No Docker:

```bash
docker compose exec app node dist/jobs/cli/poll.js --dry-run
docker compose exec app node dist/jobs/cli/poll.js
```

### Perguntar sobre vagas

**Marcando o bot** com `@` em qualquer um dos 2 grupos de Vagas (ex.: "@bot me diga vagas de junior frontend"), ele responde com o que ja esta no banco filtrado por nivel e/ou categoria — mesmo padrao do Q&A de eventos (mencao obrigatoria, sem IA). O parsing (`src/jobs/job-query.ts`) reaproveita as mesmas funcoes que ja classificam as vagas (`inferLevel`/`inferCategory` de `job.normalizer.ts`), com um cuidado a mais: o padrao de deteccao de IA/dados inclui a palavra solta "ai" (sigla em ingles), que colide com a interjeicao super comum "e aí" depois de perder o acento — por isso essa interjeicao e removida antes de inferir a categoria. Uma mencao sem nivel/categoria especifico lista as vagas mais recentes.

## Silencio noturno

Nenhuma mensagem do bot sai entre `QUIET_HOURS_START` e `QUIET_HOURS_END` (padrao 00:00-07:00), independente do tipo (vaga, evento, networking, manual) — **exceto** mensagens marcadas explicitamente com `bypassQuietHours: true` ao enfileirar (coluna `bypass_quiet_hours` em `message_queue`). A regra fica num unico lugar, `QueueRepository.claimNext` (`src/queue/queue.repository.ts`): o `QueueWorker` (`src/queue/queue.worker.ts`) informa se `isQuietHours` (`src/shared/quiet-hours.ts`) esta ativo, e o `claimNext` so reivindica mensagens com o flag de bypass enquanto isso for verdade. Mensagens comuns agendadas para a madrugada continuam `pending` e saem automaticamente assim que a janela termina.

Hoje só as mensagens de entrada/saida de grupo (`src/networking/membership-listener.ts`) usam esse bypass — são eventos reativos e de baixa frequência (não repetem sozinhos como uma vaga postada), então o usuário pediu para elas não esperarem a janela de silêncio passar. Novos usos do bypass devem seguir o mesmo criterio: só para algo que não vai se repetir/spammar.

## Networking: mencoes e entrada/saida

Os 2 grupos de Networking configurados tem automacoes reativas:

- **Mencao**: se alguem mencionar o bot com `@` num desses grupos, ele responde com uma besteira e menciona a pessoa de volta — com limite (veja abaixo). Opcionalmente com IA de verdade (veja "Resposta de mencao com IA" abaixo).
- **Entrada**: quem entra num grupo de Networking recebe boas-vindas mencionando a pessoa ("seita secreta", ler as regras).
- **Saida**: a saida e apenas **registrada** (`group_membership_log`, usada no resumo diario), sem nenhuma mensagem no grupo.

> Removido a pedido do usuario (2026-09-10): a mensagem iconica de despedida (HB20, Vasco, etc.) que era postada quando alguem saia do grupo. O registro do evento continua; a mensagem nao. Nao reintroduzir.

> Removido a pedido do usuario (2026-09-07): o bot puxava assunto sozinho (piada, critica de linguagem, enquete, noticia via Dev.to, ou pergunta direta a um participante sorteado) sempre que um grupo ficava tempo demais sem mensagem. A feature (`NetworkingIdleService`, `NetworkingIdleScheduler`, integracao com a API do Dev.to) foi removida por completo, incluindo a tabela `networking_topic_history` (migration `0012`) — nao deixar essa ideia como flag desligada, foi uma remocao definitiva.

Conteudo gerado por **templates com partes variaveis** (linguagem/framework/tema sorteados), sem IA generativa — decisao explicita para nao gastar token. `src/networking/idle-content.ts` guarda os moldes que restam (mencoes, boas-vindas, aviso de lotacao — o nome do arquivo é um resquicio historico da feature de ociosidade acima). `NetworkingRepository` (`group_activity`, `mention_reply_log`) guarda o estado de limite de mencoes e a contagem de mensagens/dia usada nas estatisticas.

### Limite de mencoes

Sem limite, o grupo poderia spammar mencionando o bot repetidamente. `NETWORKING_MENTION_MAX_PER_HOUR` (padrao 5) conta quantas respostas a mencao o bot ja deu num grupo na ultima hora corrida (`mention_reply_log`); ao atingir o limite, em vez da besteira normal ele responde uma unica vez de forma ironica avisando que vai ficar em silencio por `NETWORKING_MENTION_COOLDOWN_HOURS` (padrao 2) e entra em modo mudo de verdade — nenhuma mencao nova recebe resposta ate o prazo passar, mesmo que continuem chamando (`MentionReplyService`, `src/networking/mention-reply.service.ts`). Como a resposta tambem passa pela fila normal, uma mencao feita de madrugada so e respondida depois que a janela de silencio noturno terminar, nunca durante ela.

Mencao e entrada/saida ficam atras de `NETWORKING_SCHEDULED_ENABLED` (veja "Networking programado" abaixo — hoje e a mesma flag que liga o listener de mensagens/participantes usado por ambas as features):

```env
QUIET_HOURS_START=00:00
QUIET_HOURS_END=07:00
NETWORKING_MENTION_MAX_PER_HOUR=5
NETWORKING_MENTION_COOLDOWN_HOURS=2
```

### Resposta de mencao com IA

**Escopo deliberadamente restrito ao networking** — a IA so responde mencoes nos grupos de Networking. Eventos e Vagas tem seus proprios Q&A (veja "Perguntar sobre eventos"/"Perguntar sobre vagas"), mas ambos usam so parsing por palavra-chave, nunca IA — decisao explicita do usuario pra manter esses dois grupos previsiveis (uma resposta gerada por IA fora do padrao esperado ali viraria bagunça, diferente do networking onde a resposta e so uma brincadeira).

As respostas de mencao continuam por template por padrao (`pickMentionReply`), mas podem opcionalmente usar uma IA de verdade via [Groq](https://console.groq.com) — API gratuita e compativel com o formato da OpenAI (`chat/completions`), sem cartao de credito, com limite de taxa (~30 req/min) muito acima do que essa feature usa (no maximo `NETWORKING_MENTION_MAX_PER_HOUR` por grupo). Comparado com o free tier do Gemini, cuja politica publica diz que humanos podem revisar/usar o conteudo pra treinar o modelo, o Groq (hospeda modelos abertos, nao treina os proprios) nao documenta essa pratica — mais adequado pra conteudo de um grupo real. OpenAI nao tem free tier de API (so o ChatGPT web e gratis, a API cobra desde o primeiro request).

`generateMentionReply` (`src/networking/mention-ai.provider.ts`) manda o texto de quem mencionou o bot como contexto (`buildMentionPrompt`) com um system prompt que fixa duas coisas: o tom (direto, simpatico, sem forcar piada — fa da comunidade FullDev, mas sem humor "de tiozao"/nostalgico, que foi tentado antes e o usuario pediu pra tirar) e a regra mais importante, responder de verdade ao que foi dito (sem essa regra o modelo tende a ignorar a pergunta e devolver algo aleatorio, ja visto acontecendo em producao). Qualquer falha (sem chave configurada, timeout de 10s, rate limit, HTTP de erro, resposta vazia) cai automaticamente pro template normal — nunca trava nem derruba a resposta.

**Cuidado com o modelo:** o catalogo de modelos do Groq muda com frequencia — `llama-3.3-70b-versatile` (usado numa versao anterior) foi descontinuado e passou a devolver erro `model_not_found` silenciosamente absorvido pelo fallback, então o recurso ficou sempre caindo pro template sem nenhum aviso visivel. Troque de tempos em tempos pra confirmar que `GROQ_MODEL` ainda existe: `curl https://api.groq.com/openai/v1/models -H "authorization: Bearer $GROQ_API_KEY"`. O modelo atual (`openai/gpt-oss-20b`) é um modelo de raciocinio: ele gasta parte do token budget "pensando" num campo `reasoning` separado antes de escrever a resposta final — por isso o payload manda `reasoning_effort: "low"` e `max_tokens: 200` (nao só 80), senão a resposta final vem vazia (o modelo gasta tudo pensando e nunca chega a responder).

```env
MENTION_REPLY_AI_ENABLED=false
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
```

Pra ativar: crie uma chave gratuita em [console.groq.com](https://console.groq.com/keys), coloque em `GROQ_API_KEY` e mude `MENTION_REPLY_AI_ENABLED` pra `true`.

## Networking programado

Estas sao mensagens em **horario fixo**, todo dia, controladas por `NETWORKING_SCHEDULED_ENABLED` — a mesma flag tambem liga o listener de mensagens/participantes usado pela mencao e pelas mensagens de entrada/saida (veja "Networking: mencoes e entrada/saida" acima):

- **Spotlight** as `NETWORKING_MORNING_TIME`/`NETWORKING_LUNCH_TIME`/`NETWORKING_NIGHT_TIME` (08h/12h/20h por padrao): sorteia um participante real do grupo (via `WhatsAppConnectionManager.listParticipants`, novo, mesmo padrao de `listGroups`), exclui o proprio bot (telefone e LID — veja "Mencoes e LID" acima), evita repetir quem foi sorteado nas ultimas 24h (com fallback pro grupo inteiro se isso zerar as opcoes). Segunda e sexta usam moldes de mensagem proprios, diferentes do dia normal.
- **Resumo real** as `NETWORKING_SUMMARY_TIME` (18h por padrao): ao inves de spotlight, posta um resumo com dados de verdade do dia — nao e texto generico. Ve a secao Estatisticas abaixo pros numeros exatos que entram nesse resumo.

Novas tabelas: `group_membership_log` (historico de entrada/saida, registrado mas nao mais exibido no resumo — ver nota abaixo), `networking_spotlight_log` (evita repetir participante).

```env
NETWORKING_SCHEDULED_ENABLED=false
```

## Aprovacao automatica de entrada

Nos grupos de Networking, pedidos de entrada pendentes sao aprovados sozinhos quando o numero
parece ser de uma pessoa real **e** ainda ha vaga no grupo (`JoinRequestService`,
`src/networking/join-request.service.ts`). Exige que o bot seja **admin** do grupo — o WhatsApp
recusa a aprovacao caso contrario, e o erro fica isolado por grupo.

Duas entradas acionam a varredura: o evento `group.join-request` (imediato, enquanto o bot esta
online) e um cron a cada `NETWORKING_JOIN_REQUEST_POLL_MINUTES` (`JoinRequestsScheduler`), que
existe justamente pra pegar os pedidos que chegaram enquanto o bot estava fora do ar.

**O bot nunca rejeita ninguem.** Numero reprovado na heuristica fica pendente pra um humano
decidir. Nao trocar isso por rejeicao automatica: um falso positivo barraria uma pessoa real.

A heuristica (`isLikelyRealPhoneNumber`, `src/shared/phone.ts`) e validacao de formato, nao
deteccao de bot — **o WhatsApp nao expoe nenhum sinal de "isso e um bot"**. Ela checa E.164
(8 a 15 digitos), codigo de pais **geografico** atribuido, e para `+55` o plano brasileiro inteiro
(DDD alocado; celular de 9 digitos comecando em 9, celular legado de 8 digitos comecando em 6-9, fixo de 8 comecando em 2-5 — **o WhatsApp guarda muito numero BR sem o nono digito**, entao recusar o formato de 8 digitos barrava gente real). Faixas nao
geograficas (800 toll-free, 870/878 satelite, 881/882/883 redes globais, 888, 979) sao recusadas
porque nunca sao linha pessoal. Um LID que nao pode ser resolvido pro numero de telefone tambem
fica pendente, porque nao ha o que validar.

`NETWORKING_GROUP_CAPACITY` (padrao 1024) e o teto em que o bot para de aprovar. **1024 nao e um limite universal**: grupos ligados a uma Comunidade seguram mais (o bot ja esta em grupos de 1025 e 1114 membros). Se o valor ficar abaixo do teto real, o bot para de aprovar cedo demais e comeca a postar o aviso de lotacao com o grupo ainda tendo vaga. Por isso existe `GROUP_CAPACITY_OVERRIDES` (`<jid>:<numero>,...`): defina um teto proprio pra cada grupo que passa de 1024. Entrada malformada e ignorada em vez de derrubar o boot.

`JOBS_AUTO_APPROVE_ENABLED` estende a aprovacao automatica pros grupos de vagas, que enchem do mesmo jeito. Fica atras de flag propria porque aprovar em grupo de vagas e uma decisao separada de aprovar em networking.

Quando o grupo bate o teto e ainda ha gente na fila, o bot avisa no grupo que quem sair perde a
vaga (`buildWaitlistNoticeMessage`), no maximo uma vez a cada
`NETWORKING_WAITLIST_NOTICE_COOLDOWN_HOURS` por grupo. Esse aviso **respeita o silencio noturno**
(diferente das boas-vindas): e recorrente, dispara toda varredura enquanto o grupo seguir lotado.

```env
NETWORKING_AUTO_APPROVE_ENABLED=false
NETWORKING_GROUP_CAPACITY=1024
NETWORKING_JOIN_REQUEST_POLL_MINUTES=15
NETWORKING_WAITLIST_NOTICE_COOLDOWN_HOURS=24
```

## Faculdade: repasse de eventos

Le o grupo "Representantes de eixo" (onde as professoras divulgam eventos) e posta um resumo no
grupo "Eventos e oportunidades" da comunidade da faculdade. O bot **so le** o grupo de origem —
nunca escreve nele. Por isso ele fica fora de `getBroadcastGroupJids()`, entao nem o aviso de
atualizacao cai la dentro.

Filtro: **apenas mensagens de admins** do grupo de origem (`createAdminChecker`,
`src/faculty/faculty-relay-listener.ts`), que sao as professoras e os representantes. Conversa de
aluno no meio nao e repassada. A lista de admins fica em cache por 10 minutos pra nao pedir
metadata do grupo a cada mensagem. Se a leitura da membership falhar, o bot fica **em silencio** —
repassar tudo seria pior que nao repassar nada.

Um aviso costuma vir picotado em varias mensagens ("evento tal", "dia X", "link aqui"), entao o
servico faz **debounce**: cada mensagem nova empurra o prazo, e so depois de
`FACULTY_RELAY_DEBOUNCE_MINUTES` de silencio o lote inteiro vira um resumo so
(`FacultyRelayService`, `src/faculty/faculty-relay.service.ts`).

O resumo usa a mesma Groq das respostas de mencao, com `temperature` bem mais baixa (0.2) — aqui
criatividade significa data inventada. O prompt exige preservar nome, data, horario, local, link e
prazo, e proibe preencher dado ausente com suposicao. **Se a IA falhar, o bot repassa as mensagens
originais** em vez de perder o aviso. Captions de imagem sao lidas (`extractMessageText`,
`src/shared/messages.ts`), porque divulgacao de evento quase sempre vem como flyer com os detalhes
na legenda.

```env
FACULTY_RELAY_ENABLED=false
WHATSAPP_EIXO_REPRESENTATIVES_GROUP=
WHATSAPP_FACULTY_EVENTS_GROUP=
FACULTY_RELAY_DEBOUNCE_MINUTES=5
```

## Aviso de atualizacao

Toda atualizacao entra no `CHANGELOG.md` na raiz (formato Keep a Changelog). No boot, se a versao
do `package.json` for diferente da ultima ja anunciada, o bot posta versao + os itens daquela
entrada em todos os grupos configurados **menos os de leitura** (`ReleaseAnnouncerService`,
`src/release/release-announcer.service.ts`).

A ultima versao anunciada fica no Postgres (`app_metadata`, chave `last_announced_version`), nao em
memoria — o bot reinicia a cada deploy, e anunciar de novo a cada restart e exatamente a falha a
evitar. A versao so e gravada **depois** que todas as mensagens foram enfileiradas, entao uma falha
no meio refaz o lote no proximo boot em vez de pular grupos silenciosamente.

Escreva as entradas do changelog pensando em **quem vai ler no WhatsApp**: frase curta, sem jargao,
sem nome de arquivo. Versao sem entrada no changelog nao e anunciada, mas e gravada assim mesmo,
senao a proxima entrada de verdade correria o risco de sair duas vezes.

O `CHANGELOG.md` precisa estar dentro da imagem: o `Dockerfile` copia ele no estagio `runner`.

```env
RELEASE_ANNOUNCEMENTS_ENABLED=false
```

## Apresentacao em grupo novo

Quando o bot e adicionado a um grupo, ele se apresenta (`createGroupIntroductionListener`,
`src/networking/group-introduction-listener.ts`). Sao duas mensagens diferentes:

- **Grupo ja configurado** (qualquer JID das variaveis da secao "Grupos"): saudacao curta — todo
  mundo ali ja sabe o que e a FullDev, repetir o discurso seria ruido.
- **Qualquer outro grupo**: apresentacao completa, dele e da comunidade FullDev. Aqui o bot e
  convidado, entao dizer de onde vem e o ponto todo.

Ele reconhece a si mesmo tanto pelo JID de telefone quanto pelo LID, e guarda em memoria os grupos
onde ja se apresentou — uma reconexao pode reenviar o mesmo evento, e repetir a apresentacao no
grupo dos outros pegaria mal.

```env
GROUP_INTRODUCTION_ENABLED=false
```


## Moderacao dos grupos de vagas

Os grupos de vagas existem so para divulgacao de vaga. Mensagem que nao e vaga (nem pedido pro bot
filtrar vagas) e apagada, e quem mandou leva um ponto na **malha fina**. Na terceira, o membro e
removido e fica bloqueado por `JOBS_MODERATION_BLOCK_DAYS` dias.

**Admins do grupo sao isentos** — a checagem vem antes de qualquer outra coisa
(`createJobsModerationListener`, `src/moderation/moderation-listener.ts`).

Exige que o bot seja **admin** dos grupos de vagas: apagar mensagem e remover membro precisam disso.

### Por que o classificador e enviesado

Uma decisao errada aqui apaga a mensagem de uma pessoa real e, na terceira, tira ela da comunidade
sem que ela entenda o motivo. Errar deixando passar uma conversa custa quase nada. Por isso o prompt
manda **permitir sempre que houver duvida**, e todo caminho de falha resolve para permitido:

- Sem `GROQ_API_KEY` → permite.
- Timeout, HTTP de erro, resposta vazia → permite.
- JSON invalido ou `decision` diferente da string exata `remove` → permite.
- Nao conseguiu ler a lista de admins → **nao modera nada** (podia estar apagando mensagem de admin).

`temperature: 0` para que a mesma mensagem nao seja apagada hoje e mantida amanha.

**Vaga em imagem**: divulgacao costuma vir como flyer, sem texto nenhum. O listener descreve a
imagem primeiro (mesma IA de visao da acessibilidade) e passa a descricao pro classificador — sem
isso, uma vaga legitima seria apagada por "estar vazia". Por isso o listener de acessibilidade e
registrado **antes** do de moderacao em `server.ts`.

### Malha fina e bloqueio

Estado em duas tabelas (migration `0013`):

- `moderation_strikes` — contagem por pessoa **por grupo**, entao escorregar num grupo de vagas nao
  conta pra remocao de outro.
- `group_blocklist` — quem foi removido e ate quando. `blocked_until` e o que a aprovacao
  automatica de entrada consulta (`JoinRequestService`): pedido de quem esta bloqueado e recusado.

Ao remover, a contagem e **zerada**. Passado o bloqueio a pessoa pode voltar e tem as tres chances
de novo, em vez de ser removida na primeira mensagem. As linhas do blocklist nao sao apagadas na
expiracao — ficam como historico de quem foi removido e quando.

O aviso de remocao e enfileirado **antes** da remocao: depois de fora do grupo a pessoa nao le mais
nada. Avisos ignoram o silencio noturno, porque explicam uma mensagem que acabou de sumir.

```env
JOBS_MODERATION_ENABLED=false
JOBS_MODERATION_STRIKE_LIMIT=3
JOBS_MODERATION_BLOCK_DAYS=14
```

## Acessibilidade: descricao de imagens

Toda imagem e figurinha postada em qualquer grupo vira uma descricao em texto, para que quem usa
leitor de tela receba o conteudo em vez de silencio (`src/accessibility/`). O prompt manda
**transcrever integralmente** qualquer texto na imagem — e a parte que mais se perde — e proibe
especular sobre quem sao as pessoas ou o que aconteceu fora do quadro.

**Precisa de um modelo multimodal.** O `GROQ_MODEL` padrao (`openai/gpt-oss-*`) e so texto e
responde `messages[0].content must be a string` pra qualquer payload de imagem, entao o modelo de
visao e uma variavel separada. `qwen/qwen3.8-27b` foi verificado contra a lista de modelos da conta
e testado com imagem real antes de ser adotado como padrao — nao presumir que um modelo aceita
imagem so pelo nome.

Figurinha do WhatsApp e **WebP, quase sempre animado**, e o modelo de visao responde `invalid image data` pra esse formato — foi o que aconteceu em producao. Por isso a imagem passa por `normalizeForVision` (`sharp`) antes: WebP/GIF/AVIF viram PNG de um frame so, e imagem acima de 1400px e reduzida. A normalizacao acontece **antes** da checagem de tamanho, porque e justamente ela que traz a imagem pra baixo do limite. Se a conversao falhar, manda o original em vez de perder a descricao.

Imagem acima de `IMAGE_DESCRIPTION_MAX_BYTES` e ignorada (base64 e ~33% maior que o arquivo, e a
Groq recusa payload grande). Video e audio ficam de fora: exigiriam outro modelo.

```env
IMAGE_DESCRIPTION_ENABLED=false
GROQ_VISION_MODEL=qwen/qwen3.8-27b
IMAGE_DESCRIPTION_MAX_BYTES=3000000
```


## Estatisticas

Os numeros sao calculados a partir de mensagens **realmente enviadas/falhadas na fila** (`StatsService`, `src/stats/stats.service.ts`) — nao e estimativa. Por escolha do usuario, esses numeros nao tem endpoint nem comando CLI proprio: eles aparecem automaticamente dentro do resumo diario das 18h descrito acima.

O resumo diario (`buildDailySummary`, `src/networking/scheduled-content.ts`) mostra vagas descobertas/enviadas, eventos descobertos/enviados, lembretes de evento enviados e mensagens trocadas no grupo. `StatsService` ainda calcula mensagens de networking enviadas e mensagens com falha (podem ser uteis pra debug/futuro), e `group_membership_log` ainda registra entradas/saidas — mas nenhum desses 4 numeros aparece mais no resumo (removidos a pedido do usuario, por ficarem sempre zerados/pouco uteis no dia a dia).

## Eventos

Descobre e divulga eventos de tecnologia no grupo `WHATSAPP_EVENTS_GROUP`, com lembretes automaticos.

APIs formais de descoberta de eventos (Meetup, Eventbrite, Sympla) foram avaliadas e descartadas — todas exigem plano pago, tiveram a busca publica descontinuada, ou restringem o acesso aos eventos do proprio organizador (mesma categoria de problema do LinkedIn pra vagas). Tres providers cobrem hoje, cada um habilitavel por env var independente (mesmo padrao dos providers de vagas):

**AgendaTechBrasil** (`src/events/providers/agenda-tech-brasil.provider.ts`, `AGENDA_TECH_BRASIL_EVENTS_ENABLED`) — fonte principal. Consome o JSON estruturado publico do [agenda-tech-brasil](https://github.com/agenda-tech-brasil/agenda-tech-brasil), calendario de eventos tech no Brasil mantido pela comunidade (5.7k stars):

```text
GET https://raw.githubusercontent.com/agenda-tech-brasil/agenda-tech-brasil/main/src/db/database.json
```

Ignora anos/meses ja arquivados e qualquer evento cuja data ja passou, monta um ID sintetico estavel (a fonte nao tem ID proprio) e mapeia presencial/online/hibrido. Eventos "a definir" (sem data) so recebem a notificacao de novo evento, nunca lembrete.

**Luma** (`src/events/providers/luma.provider.ts`, `LUMA_EVENTS_ENABLED`, desativado por padrao) — faz parse do `__NEXT_DATA__` (JSON embutido no HTML da pagina Next.js) das paginas de descoberta por cidade `luma.com/saopaulo` e `luma.com/rio`. **Cobertura de São Paulo/Rio apenas - limitação da propria plataforma Luma, nao do scraper**: confirmado ao vivo que essas sao as unicas 2 cidades brasileiras com pagina de descoberta propria no Luma (testado `/brasilia`, `/salvador`, `/recife`, `/curitiba`, `/belohorizonte`, `/fortaleza`, etc - nenhuma existe; tambem nao ha pagina de pais tipo `/brazil` nem busca publica por local). Cobertura nacional de verdade ja vem do AgendaTechBrasil e do EventostiDev, que nao tem nenhum recorte de cidade. O feed por cidade mistura todo tipo de evento (moda, financas, tech), entao um filtro de palavras-chave (`isTechEventTitle`, em `event.normalizer.ts`) descarta o que nao parece ser de tecnologia — best-effort, alguns eventos tech com nome muito abstrato podem passar despercebidos. **So dados do proprio evento sao extraidos (nome/data/local/link) — o payload da Luma tambem traz dados pessoais de anfitrioes e convidados confirmados (nome, foto, redes sociais) ao lado de cada evento, e essas chaves nunca sao lidas nem repassadas.**

**EventostiDev** (`src/events/providers/eventosti-dev.provider.ts`, `EVENTOSTI_DEV_EVENTS_ENABLED`, desativado por padrao) — faz parse (via `cheerio`) dos cards da secao "Proximos Eventos" de `eventosti.dev`, um agregador exclusivamente de tecnologia (sem filtro de tema necessario, mesmo caso do AgendaTechBrasil). Volume baixo (poucos eventos cadastrados por vez).

**CafeBugado** (`src/events/providers/cafebugado.provider.ts`, `CAFEBUGADO_EVENTS_ENABLED`, desativado por padrao) — `eventos.cafebugado.com.br` tambem e Next.js com React Server Components, mas ao contrario do Sympla o problema nao e bloqueio de bot: o HTML bruto (o que `fetch`/`cheerio` veem) embute os dados dos eventos como texto solto e mal formatado, sem schema fixo. A pagina renderizada de verdade num navegador, porem, e uma grade de cards Material-UI limpa (titulo, data, hora, dia da semana, modalidade, cidade) — confirmado inspecionando com um navegador headless de verdade. Por isso esse e o **unico provider que usa Puppeteer** (`puppeteer` como dependencia real, nao `fetch`+`cheerio` como os outros) — dependencia deliberadamente mais pesada (Chromium de verdade), aceita pelo usuario so pra essa fonte. Detalhes tecnicos:

- Os campos de cada card (data `DD/MM/AAAA`, hora `HH:MM`, dia da semana, modalidade, cidade) sao identificados pelo **formato do valor**, nao pela posicao — um evento online pode nao ter campo de cidade, deslocando a ordem.
- O botao "Saber mais sobre o evento" nao e um link, e um `<button>` que abre uma aba nova via JavaScript — descobrir a URL real de cada evento exigiria clicar em cada um dos ~50 eventos (6 paginas) a cada consulta. Por escolha explicita do usuario, **toda mensagem desse provider aponta pra pagina geral de eventos** (`eventos.cafebugado.com.br/eventos`), nao pro evento especifico — mais rapido e simples que clicar evento por evento.
- Percorre as paginas clicando nos botoes de paginacao (`goToPage`) ate acabarem as paginas.
- As imagens dos cards vêm do CDN do Luma (`images.lumacdn.com`), sugerindo que esse site tambem reaproveita eventos de la — pode haver sobreposicao com o provider Luma (fingerprints diferentes por terem URL/fonte diferentes, entao nao ha dedup automatico entre os dois hoje).
- Roda com `--no-sandbox` (Chromium como root no container). Em producao usa o Chromium do sistema operacional via `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` (setado no `Dockerfile`, instalado via `apt-get`) em vez do download proprio do Puppeteer (`PUPPETEER_SKIP_DOWNLOAD=true`) — **nao defina `PUPPETEER_EXECUTABLE_PATH` no `.env.local`/`.env.example`**, nem vazio: pelo mecanismo de `env_file` do docker-compose isso sobrescreveria o valor do Dockerfile.

Sympla foi descartado como fonte de scraping: alem da mesma restricao de API do organizador, as paginas de evento usam React Server Components em streaming (sem `__NEXT_DATA__` ou JSON estavel) **e** bloqueio ativo via Cloudflare, tornando o parsing impraticavel mesmo com navegador headless.

**So divulga o mes atual.** Um evento descoberto para um mes futuro fica salvo no banco (dedup normal, conta pro `EVENTS_MAX_PER_DAY`), mas so gera a mensagem de "Novo evento" quando `startDate` cai no mes corrente (comparado contra `America/Sao_Paulo`) — ou imediatamente, se for um evento "a definir" (sem data). Ele nao fica esquecido: continua existindo pros lembretes/promocao abaixo e pras perguntas no grupo, so nao e anunciado assim que descoberto (`isInCurrentMonth`, `event.normalizer.ts`).

Lembretes automaticos em 7 dias, 3 dias, 1 dia (amanha) e no dia do evento, uma vez por tipo por evento (nunca reenvia, controlado pela tabela `event_notifications`), comparando a data do evento (guardada em UTC) contra o dia civil em `America/Sao_Paulo`, as `EVENT_REMINDER_TIME` (padrao 09:00) via `EventRemindersScheduler`.

**Promocao 5 dias antes**: `EventPromoScheduler` (`src/scheduler/event-promo.scheduler.ts`, horario `EVENT_PROMO_TIME`, padrao 10:00) cria, uma vez por evento, um **Evento nativo do WhatsApp** (`{event: {...}}`, suportado pelo Baileys), uma **enquete nativa** ("Vai participar de X? Sim/Nao/Talvez") e uma mensagem perguntando quem vai marcando **todo mundo do grupo via `mentionAll` nativo do WhatsApp** (o mesmo mecanismo do "@todos" — `contextInfo.nonJidMentions`, sem precisar listar/resolver o JID de cada participante) — tudo isso 5 dias antes da data, entre os lembretes de 7 e 3 dias (`EventService.sendPromotions`, tipo de fila `event_promo`, notificacao `event_promo` — mesma logica de "so uma vez" dos lembretes).

**Perguntar sobre eventos**: **marcando o bot** com `@` no grupo de Eventos (ex.: "@bot tem evento em outubro?", "@bot tem evento em Recife?"), ele responde com o que ja esta no banco por mes e/ou localidade — parsing best-effort do texto (`src/events/event-query.ts`), consultando `EventRepository.query()` via `EventQnaService`. Sem mencionar o bot, nenhuma mensagem do grupo recebe resposta (uma versao anterior respondia a qualquer mensagem que parecesse pergunta e disparava sem querer com conversa comum contendo a palavra "evento" - corrigido pra exigir a mencao). Uma mencao sem mes/local especifico (so "@bot tem evento?") lista os proximos eventos cadastrados.

**Limpeza automatica**: todo dia as `EVENT_CLEANUP_TIME` (padrao 03:00), `EventCleanupScheduler` apaga do banco qualquer evento cuja data ja passou (comparado contra o dia civil em `America/Sao_Paulo`) — `EventRepository.deleteExpired`. Eventos "a definir" (sem `startDate`) nunca sao apagados por essa rotina, ja que nao ha data pra julgar se venceram. A tabela `event_notifications` tem `ON DELETE CASCADE` na FK pra `events`, entao apagar o evento limpa as notificacoes junto, sem violar a constraint.

```env
EVENTS_POLL_INTERVAL_MINUTES=15
EVENTS_POLL_ENABLED=false
EVENTS_MAX_PER_DAY=10
EVENT_REMINDER_TIME=09:00
EVENT_PROMO_TIME=10:00
EVENT_CLEANUP_TIME=03:00
AGENDA_TECH_BRASIL_EVENTS_ENABLED=true
LUMA_EVENTS_ENABLED=false
EVENTOSTI_DEV_EVENTS_ENABLED=false
CAFEBUGADO_EVENTS_ENABLED=false
```

Validar sem salvar/enfileirar (por padrao usa o AgendaTechBrasil; os outros `--provider=` testam cada fonte):

```bash
npm run events:poll -- --dry-run
npm run events:poll -- --dry-run --provider=luma
npm run events:poll -- --dry-run --provider=eventostidev
npm run events:poll -- --dry-run --provider=cafebugado
```

## Descricao do grupo

Com o bot como administrador, ele pode editar a descricao de um grupo (`WhatsAppConnectionManager.updateGroupDescription`, usa `groupUpdateDescription` do Baileys). E uma acao pontual, nao automatica — roda manualmente via CLI:

```bash
npm run whatsapp:update-group-description -- <group-jid> "texto da descricao"
```

## Endpoints

Healthcheck simples:

```http
GET /health
```

Readiness:

```http
GET /ready
```

O `/ready` verifica PostgreSQL, worker da fila e estado do WhatsApp.

## Estrutura

```text
src/
  app.ts
  server.ts
  config/
  database/
  events/
    providers/
    cli/
  jobs/
    providers/
    cli/
  accessibility/
  faculty/
  moderation/
  networking/
  queue/
  release/
  scheduler/
  stats/
  whatsapp/
    cli/
  shared/
drizzle/
scripts/
Dockerfile
docker-compose.yml
```

## Backup e recuperacao

O bot guarda dois tipos de estado que **nao existem em nenhum outro lugar** se forem perdidos: a sessao pareada do WhatsApp (volume `whatsapp_auth`) e o banco Postgres (volume `postgres_data`). Nenhum dos dois tinha backup ate agora.

`scripts/backup.sh` gera dois arquivos em `./backups/` (fora de qualquer volume Docker, para nao serem perdidos junto se um volume corromper ou for removido por engano):

```bash
./scripts/backup.sh
```

Le os dados atraves dos proprios containers `app`/`postgres` (`docker compose exec`), entao funciona independente do nome real do volume Docker (que muda conforme o nome da pasta do projeto). Remove sozinho backups com mais de 14 dias.

**`backups/` esta no `.gitignore`** — o backup do WhatsApp contem as credenciais reais da sessao pareada (equivalente a controle total da conta), nunca deve ir pro git nem ser compartilhado.

Pra agendar automaticamente (uma vez que o bot estiver numa VPS), adicionar no crontab do servidor:

```cron
0 3 * * * cd /caminho/do/projeto && ./scripts/backup.sh >> backups/backup.log 2>&1
```

**Restaurar** (ambos os scripts pedem confirmacao explicita antes de sobrescrever, por serem destrutivos):

```bash
./scripts/restore-postgres.sh backups/postgres_20260906_030000.sql.gz
./scripts/restore-whatsapp.sh backups/whatsapp_auth_20260906_030000.tar.gz
```

**Sessao "deslogada" (logged out)**: se o WhatsApp invalidar a sessao (numero desparelhado manualmente, sessao expirada), o bot **nao** tenta reconectar sozinho — nao adianta, precisa de um QR code novo ou parear de novo via `WHATSAPP_PAIRING_PHONE_NUMBER`. Isso agora fica bem visivel no log, em nivel `fatal` (`WhatsAppConnectionManager`, `src/whatsapp/connection.ts`), diferente de uma queda de rede comum (nivel `warn`, reconecta sozinho com backoff exponencial). Restaurar um backup antigo da sessao **nao resolve** esse caso — se o WhatsApp ja invalidou, qualquer sessao (nova ou restaurada) precisa parear de novo; o backup so serve pra reverter uma corrupcao/perda acidental do volume, nao uma sessao deslogada de propósito.

## Deploy

`scripts/deploy.sh` encapsula a sequencia manual que ate agora era feita passo a passo (`git pull`, rebuild, restart): puxa o codigo mais recente da branch atual, **faz backup antes de qualquer coisa** (`scripts/backup.sh`, ja que um deploy ruim que corrompesse dados seria pior sem um backup fresco), reconstroi a imagem, reinicia o container e espera o healthcheck (`/health`, configurado no `docker-compose.yml`) ficar `healthy` antes de considerar sucesso — se nao ficar em 60s ou reportar `unhealthy`, o script termina com erro e manda checar `docker compose logs app`.

```bash
./scripts/deploy.sh
```

Deliberadamente **manual** — nao ha webhook nem CI disparando isso sozinho. Testado de ponta a ponta contra os containers reais.

## Proxima fase

Todos os itens do roadmap original (vagas, mencoes/entrada-saida, networking programado, estatisticas, eventos) estao implementados - memes e a feature de ociosidade (posts automaticos por tempo de silencio) foram removidos por escolha do usuario. Robustez de producao: backup/recuperacao dos volumes, deploy com healthcheck e alerta melhorado de sessao deslogada ja feitos (secoes acima). Protecao de endpoints administrativos e moot por enquanto (hoje so existem `/health` e `/ready`, sem autenticacao — so vira relevante quando algum endpoint de controle for adicionado). **VPS em producao desde 2026-09-07** (HostGator, `/opt/bot-fulldev`) - a execucao ja nao depende mais da maquina local do usuario.
