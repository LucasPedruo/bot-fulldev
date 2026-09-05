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

Nenhuma dessas 4 APIs expoe um filtro de categoria "tech" confiavel (RemoteOK e Arbeitnow nao tem categoria nenhuma; o `parentCategories` do Himalayas fica vazio mesmo em vagas claramente tecnicas), entao o provider filtra localmente pelo **titulo** da vaga com tecnologias conhecidas e palavras-chave de cargo (developer/desenvolvedor, engineer/engenheiro, devops, qa, etc. — o Himalayas usa palavras-chave em portugues tambem). Tags e descricao nao entram nessa decisao porque sao texto livre e geram falsos positivos (ex.: tag "react" numa vaga de gerente de loja no RemoteOK, "engineering" mencionado na descricao de uma vaga de suporte no Arbeitnow).

Em desenvolvimento local, `.env.local` deixa `JOBS_POLL_ENABLED=false` para evitar postar dezenas de vagas acidentalmente nos grupos reais. Em producao, habilite os providers um de cada vez:

```env
JOBS_POLL_ENABLED=true
JOBICY_JOBS_COUNT=50
REMOTIVE_JOBS_ENABLED=false
REMOTIVE_JOBS_COUNT=20
REMOTEOK_JOBS_ENABLED=false
REMOTEOK_JOBS_COUNT=20
ARBEITNOW_JOBS_ENABLED=false
ARBEITNOW_JOBS_COUNT=20
HIMALAYAS_JOBS_ENABLED=false
HIMALAYAS_JOBS_COUNT=20
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
  queue/
  whatsapp/
  shared/
drizzle/
Dockerfile
docker-compose.yml
```

## Proxima fase

Proximo passo: adicionar RemoteOK, validando documentacao atual, normalizacao e deduplicacao antes de habilitar no scheduler.
