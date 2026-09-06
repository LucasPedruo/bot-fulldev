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

Nenhuma mensagem do bot sai entre `QUIET_HOURS_START` e `QUIET_HOURS_END` (padrao 00:00-07:00), independente do tipo (vaga, evento, networking, manual). A regra fica num unico lugar, `QueueWorker.processOne` (`src/queue/queue.worker.ts`), que se recusa a reivindicar qualquer mensagem da fila enquanto `isQuietHours` (`src/shared/quiet-hours.ts`) for verdadeiro. Mensagens agendadas para a madrugada continuam `pending` e saem automaticamente assim que a janela termina — nenhum outro modulo (scheduler, service, listener) precisa se preocupar com isso.

## Networking: ociosidade, mencoes e entrada/saida

Os 2 grupos de Networking configurados tem automacoes reativas:

- **Ociosidade**: se um grupo ficar `NETWORKING_IDLE_THRESHOLD_MINUTES` (padrao 60) sem nenhuma mensagem, o bot puxa assunto — piada, critica de linguagem, enquete (poll nativo do WhatsApp) ou, ocasionalmente, uma noticia real de tech via [Dev.to API](https://developers.forem.com/api) (`GET https://dev.to/api/articles?top=1`, publica, sem chave). Verificado a cada `NETWORKING_IDLE_CHECK_INTERVAL_MINUTES` (padrao 10) via `NetworkingIdleScheduler` (`src/scheduler/networking-idle.scheduler.ts`).
- **Mencao**: se alguem mencionar o bot com `@` num desses grupos, ele responde com uma besteira e menciona a pessoa de volta — com limite (veja abaixo).
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
NETWORKING_IDLE_THRESHOLD_MINUTES=60
NETWORKING_IDLE_CHECK_INTERVAL_MINUTES=10
NETWORKING_MENTION_MAX_PER_HOUR=5
NETWORKING_MENTION_COOLDOWN_HOURS=2
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
  jobs/
  networking/
  queue/
  scheduler/
  whatsapp/
  shared/
drizzle/
Dockerfile
docker-compose.yml
```

## Proxima fase

Eventos (`src/events/`): modelo, deduplicacao por fonte/externalId, lembretes em 7/3/1 dia e no dia, tabela de notificacoes para nao reenviar.
