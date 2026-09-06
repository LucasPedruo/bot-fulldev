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

O bot espera cinco grupos configuraveis:

```env
WHATSAPP_JOBS_GROUP_1=
WHATSAPP_JOBS_GROUP_2=
WHATSAPP_EVENTS_GROUP=
WHATSAPP_NETWORKING_GROUP_1=
WHATSAPP_NETWORKING_GROUP_2=
```

`WHATSAPP_NETWORKING_GROUP` ainda existe como alias legado para o primeiro grupo de networking.

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

## Silencio noturno

Nenhuma mensagem do bot sai entre `QUIET_HOURS_START` e `QUIET_HOURS_END` (padrao 00:00-07:00), independente do tipo (vaga, evento, networking, manual) — **exceto** mensagens marcadas explicitamente com `bypassQuietHours: true` ao enfileirar (coluna `bypass_quiet_hours` em `message_queue`). A regra fica num unico lugar, `QueueRepository.claimNext` (`src/queue/queue.repository.ts`): o `QueueWorker` (`src/queue/queue.worker.ts`) informa se `isQuietHours` (`src/shared/quiet-hours.ts`) esta ativo, e o `claimNext` so reivindica mensagens com o flag de bypass enquanto isso for verdade. Mensagens comuns agendadas para a madrugada continuam `pending` e saem automaticamente assim que a janela termina.

Hoje só as mensagens de entrada/saida de grupo (`src/networking/membership-listener.ts`) usam esse bypass — são eventos reativos e de baixa frequência (não repetem sozinhos como um tópico de ociosidade ou uma vaga postada), então o usuário pediu para elas não esperarem a janela de silêncio passar. Novos usos do bypass devem seguir o mesmo criterio: só para algo que não vai se repetir/spammar.

## Networking: ociosidade, mencoes e entrada/saida

Os 2 grupos de Networking configurados tem automacoes reativas:

- **Ociosidade**: se um grupo ficar `NETWORKING_IDLE_THRESHOLD_MINUTES` (padrao 120, ou seja 2h) sem nenhuma mensagem, o bot puxa assunto — piada, critica de linguagem, enquete (poll nativo do WhatsApp), ocasionalmente uma noticia real de tech via [Dev.to API](https://developers.forem.com/api) (`GET https://dev.to/api/articles?top=1`, publica, sem chave), ou uma **pergunta direta marcando um participante real** do grupo (sorteado via `WhatsAppConnectionManager.listParticipants`, excluindo o proprio bot) — assim nem toda mensagem de ociosidade e uma pergunta solta no vazio. Verificado a cada `NETWORKING_IDLE_CHECK_INTERVAL_MINUTES` (padrao 10) via `NetworkingIdleScheduler` (`src/scheduler/networking-idle.scheduler.ts`).
- **Mencao**: se alguem mencionar o bot com `@` num desses grupos, ele responde com uma besteira e menciona a pessoa de volta — com limite (veja abaixo). Opcionalmente com IA de verdade (veja "Resposta de mencao com IA" abaixo).
- **Entrada/saida**: quem entra num grupo de Networking recebe boas-vindas mencionando a pessoa ("seita secreta", ler as regras); quem sai leva uma mensagem iconica de despedida (HB20, Vasco, etc.), sem mencao.

Conteudo gerado por **templates com partes variaveis** (linguagem/framework/tema sorteados), sem IA generativa — decisao explicita para nao gastar token. `src/networking/idle-content.ts` guarda todos os moldes (topicos, mencoes, boas-vindas, despedidas). `NetworkingRepository` (`group_activity`, `networking_topic_history`, `mention_reply_log`) evita repetir os ultimos usados por grupo e guarda o timestamp da ultima atividade real (atualizado por um listener de `messages.upsert` no Baileys, que hoje nao existia) e o estado de limite de mencoes.

Postar um topico de ociosidade **reseta o relogio de silencio** daquele grupo (evita disparar de novo antes de completar mais uma hora real de silencio).

### Limite de mencoes

Sem limite, o grupo poderia spammar mencionando o bot repetidamente. `NETWORKING_MENTION_MAX_PER_HOUR` (padrao 5) conta quantas respostas a mencao o bot ja deu num grupo na ultima hora corrida (`mention_reply_log`); ao atingir o limite, em vez da besteira normal ele responde uma unica vez de forma ironica avisando que vai ficar em silencio por `NETWORKING_MENTION_COOLDOWN_HOURS` (padrao 2) e entra em modo mudo de verdade — nenhuma mencao nova recebe resposta ate o prazo passar, mesmo que continuem chamando (`MentionReplyService`, `src/networking/mention-reply.service.ts`). Como a resposta tambem passa pela fila normal, uma mencao feita de madrugada so e respondida depois que a janela de silencio noturno terminar, nunca durante ela.

Desligado por padrao (`NETWORKING_IDLE_ENABLED=false`) — a mesma flag liga ociosidade, mencoes e entrada/saida:

```env
QUIET_HOURS_START=00:00
QUIET_HOURS_END=07:00
NETWORKING_IDLE_ENABLED=false
NETWORKING_IDLE_THRESHOLD_MINUTES=120
NETWORKING_IDLE_CHECK_INTERVAL_MINUTES=10
NETWORKING_MENTION_MAX_PER_HOUR=5
NETWORKING_MENTION_COOLDOWN_HOURS=2
```

### Resposta de mencao com IA

As respostas de mencao continuam por template por padrao (`pickMentionReply`), mas podem opcionalmente usar uma IA de verdade via [Groq](https://console.groq.com) — API gratuita e compativel com o formato da OpenAI (`chat/completions`), sem cartao de credito, com limite de taxa (~30 req/min) muito acima do que essa feature usa (no maximo `NETWORKING_MENTION_MAX_PER_HOUR` por grupo). Comparado com o free tier do Gemini, cuja politica publica diz que humanos podem revisar/usar o conteudo pra treinar o modelo, o Groq (hospeda modelos abertos, nao treina os proprios) nao documenta essa pratica — mais adequado pra conteudo de um grupo real. OpenAI nao tem free tier de API (so o ChatGPT web e gratis, a API cobra desde o primeiro request).

`MentionAiProvider` (`src/networking/mention-ai.provider.ts`) manda o texto de quem mencionou o bot como contexto (`buildMentionPrompt`) com um system prompt fixando o tom (engraçado, autodepreciativo, PT-BR, uma frase curta). Qualquer falha (sem chave configurada, timeout de 10s, rate limit, resposta vazia) cai automaticamente pro template normal — nunca trava nem derruba a resposta.

```env
MENTION_REPLY_AI_ENABLED=false
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
```

Pra ativar: crie uma chave gratuita em [console.groq.com](https://console.groq.com/keys), coloque em `GROQ_API_KEY` e mude `MENTION_REPLY_AI_ENABLED` pra `true`.

## Networking programado

Diferente da ociosidade (reativa), estas sao mensagens em **horario fixo**, todo dia, controladas por `NETWORKING_SCHEDULED_ENABLED` (flag propria, independente de `NETWORKING_IDLE_ENABLED`):

- **Spotlight** as `NETWORKING_MORNING_TIME`/`NETWORKING_LUNCH_TIME`/`NETWORKING_NIGHT_TIME` (08h/12h/20h por padrao): sorteia um participante real do grupo (via `WhatsAppConnectionManager.listParticipants`, novo, mesmo padrao de `listGroups`), exclui o proprio bot (telefone e LID — veja a nota sobre LID abaixo), evita repetir quem foi sorteado nas ultimas 24h (com fallback pro grupo inteiro se isso zerar as opcoes). Segunda e sexta usam moldes de mensagem proprios, diferentes do dia normal.
- **Resumo real** as `NETWORKING_SUMMARY_TIME` (18h por padrao): ao inves de spotlight, posta um resumo com dados de verdade do dia — nao e texto generico. Ve a secao Estatisticas abaixo pros numeros exatos que entram nesse resumo.

Novas tabelas: `group_membership_log` (historico de entrada/saida, usado pelo resumo), `networking_spotlight_log` (evita repetir participante).

```env
NETWORKING_SCHEDULED_ENABLED=false
```

## Estatisticas

Os numeros pedidos (vagas descobertas/enviadas, eventos descobertos/enviados, lembretes de evento enviados, mensagens de networking enviadas, mensagens com falha) sao calculados a partir de mensagens **realmente enviadas/falhadas na fila** (`StatsService`, `src/stats/stats.service.ts`) — nao e estimativa. Por escolha do usuario, esses numeros nao tem endpoint nem comando CLI proprio: eles aparecem automaticamente dentro do resumo diario das 18h descrito acima.

## Memes

Estrutura para o bot enviar imagens de meme nos grupos de Networking, misturadas no conteudo de ociosidade (`NetworkingIdleService`) com chance configuravel (`MEMES_CHANCE`, padrao 10%).

`assets/memes/` comeca **vazia** — nao existem memes de verdade ainda. Para adicionar:

```text
assets/memes/
  backend/
    deploy-sexta.jpg
  frontend/
    centralizar-div.png
```

Depois rode `npm run memes:sync` para registrar os arquivos novos no banco (categoria = nome da subpasta; legenda em branco, edite depois se quiser). O meme escolhido e sempre o que esta ha mais tempo sem ser usado (tabela `memes`, colunas `category`/`filename`/`caption`/`lastUsedAt`).

```env
MEMES_DIR=assets/memes
MEMES_SEND_ENABLED=false
MEMES_CHANCE=0.1
```

`MEMES_SEND_ENABLED=false` por padrao — mesmo com memes cadastrados, nada e enviado ate essa flag virar `true`.

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

Sympla foi descartado como fonte de scraping: alem da mesma restricao de API do organizador, as paginas de evento usam React Server Components em streaming (sem `__NEXT_DATA__` ou JSON estavel), tornando o parsing impraticavel.

**So divulga o mes atual.** Um evento descoberto para um mes futuro fica salvo no banco (dedup normal, conta pro `EVENTS_MAX_PER_DAY`), mas so gera a mensagem de "Novo evento" quando `startDate` cai no mes corrente (comparado contra `America/Sao_Paulo`) — ou imediatamente, se for um evento "a definir" (sem data). Ele nao fica esquecido: continua existindo pros lembretes/promocao abaixo e pras perguntas no grupo, so nao e anunciado assim que descoberto (`isInCurrentMonth`, `event.normalizer.ts`).

Lembretes automaticos em 7 dias, 3 dias, 1 dia (amanha) e no dia do evento, uma vez por tipo por evento (nunca reenvia, controlado pela tabela `event_notifications`), comparando a data do evento (guardada em UTC) contra o dia civil em `America/Sao_Paulo`, as `EVENT_REMINDER_TIME` (padrao 09:00) via `EventRemindersScheduler`.

**Promocao 5 dias antes**: `EventPromoScheduler` (`src/scheduler/event-promo.scheduler.ts`, horario `EVENT_PROMO_TIME`, padrao 10:00) cria, uma vez por evento, um **Evento nativo do WhatsApp** (`{event: {...}}`, suportado pelo Baileys), uma **enquete nativa** ("Vai participar de X? Sim/Nao/Talvez") e uma mensagem marcando todo mundo do grupo perguntando quem vai — tudo isso 5 dias antes da data, entre os lembretes de 7 e 3 dias (`EventService.sendPromotions`, tipo de fila `event_promo`, notificacao `event_promo` — mesma logica de "so uma vez" dos lembretes).

**Perguntar sobre eventos**: **marcando o bot** com `@` no grupo de Eventos (ex.: "@bot tem evento em outubro?", "@bot tem evento em Recife?"), ele responde com o que ja esta no banco por mes e/ou localidade — parsing best-effort do texto (`src/events/event-query.ts`), consultando `EventRepository.query()` via `EventQnaService`. Sem mencionar o bot, nenhuma mensagem do grupo recebe resposta (uma versao anterior respondia a qualquer mensagem que parecesse pergunta e disparava sem querer com conversa comum contendo a palavra "evento" - corrigido pra exigir a mencao). Uma mencao sem mes/local especifico (so "@bot tem evento?") lista os proximos eventos cadastrados.

```env
EVENTS_POLL_INTERVAL_MINUTES=15
EVENTS_POLL_ENABLED=false
EVENTS_MAX_PER_DAY=10
EVENT_REMINDER_TIME=09:00
EVENT_PROMO_TIME=10:00
AGENDA_TECH_BRASIL_EVENTS_ENABLED=true
LUMA_EVENTS_ENABLED=false
EVENTOSTI_DEV_EVENTS_ENABLED=false
```

Validar sem salvar/enfileirar (por padrao usa o AgendaTechBrasil; `--provider=luma` ou `--provider=eventostidev` testam os outros):

```bash
npm run events:poll -- --dry-run
npm run events:poll -- --dry-run --provider=luma
npm run events:poll -- --dry-run --provider=eventostidev
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
  memes/
    cli/
  networking/
  queue/
  scheduler/
  stats/
  whatsapp/
    cli/
  shared/
assets/
  memes/
drizzle/
Dockerfile
docker-compose.yml
```

## Proxima fase

Todos os itens do roadmap original (vagas, ociosidade/mencoes/entrada-saida, networking programado, estatisticas, memes, eventos) estao implementados. O que falta e producao: backup do volume `whatsapp_auth`, plano de recuperacao apos falha, atualizacao do container, monitoramento/logs centralizados, protecao de endpoints administrativos (hoje so existem `/health` e `/ready`, sem autenticacao — relevante quando algum endpoint de controle for adicionado) e configuracao de VPS.
