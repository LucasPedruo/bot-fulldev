# SSD: Bot FullDev para grupos externos

Status: proposta futura
Data: 2026-09-10

## Contexto

Hoje o bot FullDev opera em grupos conhecidos e configurados por variaveis de ambiente. Essa decisao funciona bem para a comunidade atual, mas limita o uso por faculdades, atleticas, coletivos e outras comunidades de tecnologia que querem receber vagas e eventos em seus proprios grupos de WhatsApp.

A proposta e criar um fluxo controlado para que uma comunidade solicite uso do bot, informe o link do grupo e escolha o tipo de conteudo desejado. A equipe FullDev revisa o cadastro, aprova ou rejeita, e somente depois o bot entra no grupo e passa a enviar conteudo conforme a configuracao aprovada.

## Objetivos

- Permitir que o bot opere em multiplos grupos externos aprovados manualmente.
- Manter controle editorial e operacional sobre quais grupos recebem o bot.
- Suportar configuracao por grupo: vagas, eventos, filtros, moderacao e horarios de silencio.
- Evitar que a abertura para terceiros transforme o bot em ferramenta de spam.
- Controlar custos de IA, principalmente chamadas ao Groq para moderacao, respostas e descricao de imagem.
- Preservar a arquitetura atual de fila, deduplicacao e envio gradual.

## Fora de escopo inicial

- Marketplace publico sem aprovacao humana.
- Painel completo de self-service para comunidades editarem tudo sozinhas.
- Cobrar assinatura de comunidades no MVP.
- Garantir compatibilidade oficial com WhatsApp Business Platform para grupos.
- Disparo em massa irrestrito.

## Estado atual do codigo

Os grupos sao configurados estaticamente em `src/whatsapp/groups.ts`, com origem em variaveis como `WHATSAPP_JOBS_GROUP_1`, `WHATSAPP_EVENTS_GROUP` e `WHATSAPP_NETWORKING_GROUP_1`.

O envio de vagas ja tem boa base para multi-grupo porque `JobService` enfileira mensagens por `destinationGroup` e `job_deliveries` ja deduplica por vaga e destino.

Eventos precisam de ajuste maior: lembretes, promocoes e notificacoes usam o grupo unico de eventos configurado no ambiente. Alem disso, `event_notifications` registra unicidade por evento e tipo, mas nao por grupo. Em um modelo multi-grupo, a notificacao precisa ser rastreada por destino.

A fila atual envia uma mensagem por intervalo global. Com muitos grupos, o gargalo deixa de ser CPU e passa a ser vazao de envio e risco de comportamento parecido com automacao em massa.

## Produto proposto

### Fluxo publico

1. Responsavel acessa uma pagina de cadastro.
2. Informa:
   - nome da comunidade;
   - instituicao ou organizacao;
   - nome e contato do responsavel;
   - link de convite do grupo;
   - tipo de grupo: vagas, eventos, vagas e eventos, networking;
   - filtros de vagas desejados: nivel, area, remoto/presencial;
   - preferencias de eventos: online, presencial, cidade/regiao;
   - se deseja moderacao automatica;
   - janela de silencio;
   - aceite de regras de uso.
3. O cadastro entra como `pending`.
4. Nenhuma acao automatica acontece antes da aprovacao.

### Fluxo administrativo

1. Admin FullDev lista solicitacoes pendentes.
2. Admin revisa link, responsavel e adequacao da comunidade.
3. Admin pode aprovar, rejeitar ou pedir ajuste.
4. Ao aprovar:
   - o sistema extrai o codigo do link `chat.whatsapp.com/...`;
   - o bot tenta entrar no grupo via Baileys;
   - o `groupJid` retornado e salvo;
   - a configuracao aprovada fica ativa;
   - o grupo recebe uma mensagem curta explicando o que o bot faz e como remover/desativar.

## Modelo de dados sugerido

### `community_group_requests`

- `id`
- `status`: `pending`, `approved`, `rejected`, `needs_changes`
- `community_name`
- `institution_name`
- `owner_name`
- `owner_contact`
- `invite_url`
- `requested_features`: JSON
- `requested_filters`: JSON
- `review_notes`
- `reviewed_by`
- `reviewed_at`
- `created_at`
- `updated_at`

### `community_groups`

- `id`
- `request_id`
- `group_jid`
- `group_name`
- `status`: `active`, `paused`, `left`, `blocked`
- `features`: JSON
- `filters`: JSON
- `quiet_hours_start`
- `quiet_hours_end`
- `daily_message_limit`
- `daily_ai_call_limit`
- `created_at`
- `updated_at`

### `community_group_ai_usage`

- `id`
- `community_group_id`
- `provider`
- `model`
- `feature`: `moderation`, `mention_reply`, `image_description`, `faculty_summary`
- `input_tokens`
- `output_tokens`
- `occurred_at`

### Ajuste em notificacoes de eventos

Adicionar destino ao controle de notificacoes:

- `event_notifications.destination_group`
- unicidade: `event_id`, `type`, `destination_group`

Sem isso, o primeiro grupo que receber um lembrete impediria outros grupos de receberem o mesmo lembrete.

## Mudancas de aplicacao

### Configuracao de grupos

Criar um repositorio de grupos ativos, por exemplo `CommunityGroupRepository`, e substituir gradualmente os usos de `getConfiguredWhatsAppGroups()` em fluxos de envio por consultas ao banco.

Manter os grupos via `.env` como grupos internos FullDev durante a migracao. O repositorio pode expor dois conjuntos:

- grupos internos configurados por ambiente;
- grupos externos aprovados no banco.

### Vagas

Alterar `JobService.enqueueJobToJobsGroups` para buscar destinos ativos de vagas. Cada destino aplica filtros antes de enfileirar:

- nivel: estagio, junior, pleno, senior;
- categoria: frontend, backend, dados, mobile, QA, design, etc.;
- remoto/presencial;
- limite diario por grupo.

`job_deliveries` ja esta proximo do necessario porque deduplica por `jobId` e `destinationGroup`.

### Eventos

Alterar `EventService` para trabalhar com multiplos destinos:

- novos eventos;
- lembretes;
- promocoes;
- enquetes;
- evento nativo do WhatsApp.

Cada notificacao deve ser registrada por evento, tipo e grupo.

### Moderacao

Moderacao automatica deve ser opt-in por grupo e com falha segura. Se Groq falhar, a politica atual de permitir a mensagem deve continuar.

Para grupos externos, a moderacao nao deve remover participantes no MVP. Comecar com modo observacao ou apenas apagar mensagens claramente indevidas quando o bot for admin e o responsavel tiver optado por isso explicitamente.

### Entrada no grupo

Baileys oferece `groupAcceptInvite(code)`, que permite entrar em grupos a partir do codigo do convite. O fluxo precisa:

- validar que o link e de WhatsApp;
- extrair apenas o codigo;
- chamar `groupGetInviteInfo(code)` antes de entrar, quando possivel;
- registrar nome/metadados do grupo para revisao;
- entrar apenas apos aprovacao;
- tratar erro de link expirado, grupo cheio, permissao negada ou conta limitada.

## Custos e limites

### VPS

No MVP, a VPS atual da HostGator tende a ser suficiente. O trabalho pesado e majoritariamente I/O: chamadas HTTP para providers, banco, fila e WhatsApp. O gargalo esperado nao e CPU, e sim vazao segura de mensagens e chamadas de IA.

### Groq

Os limites oficiais do plano gratuito variam por modelo e por organizacao. Em 2026-09-10, a documentacao de rate limits lista para `openai/gpt-oss-20b` no plano free limites base de 30 RPM, 1000 RPD, 8K TPM e 200K TPD. A propria documentacao recomenda consultar a pagina de limites da conta para valores exatos.

No plano Developer, a pagina de modelos lista `openai/gpt-oss-20b` a USD 0.075 por 1M tokens de entrada e USD 0.30 por 1M tokens de saida.

Links:

- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/models

Politica recomendada:

- IA desativada por padrao para grupos externos.
- Quota diaria por grupo.
- Quota diaria global.
- Descricao de imagem desativada no MVP externo.
- Moderacao por IA em modo conservador e com fallback para permitir.
- Logs de consumo por feature, grupo, modelo e dia.

## Riscos de WhatsApp

O projeto usa Baileys, que depende do WhatsApp Web e nao e a API oficial da Meta. Isso traz risco operacional: limitacao de conta, logout, bloqueio temporario ou banimento se o comportamento parecer automacao indevida.

O WhatsApp declara que mensagens automaticas ou em massa nao autorizadas violam seus termos, e tambem alerta sobre clientes nao oficiais.

Links:

- https://www.whatsapp.com/legal/terms-of-service
- https://faq.whatsapp.com/5957850900902049
- https://faq.whatsapp.com/1217634902127718

Mitigacoes:

- Aprovacao humana obrigatoria.
- Opt-in explicito do admin/responsavel do grupo.
- Frequencia baixa e previsivel.
- Janela de silencio por grupo.
- Limites diarios por comunidade.
- Sem venda como ferramenta de disparo em massa.
- Comando/processo claro para pausar ou remover o bot.
- Observabilidade para detectar falhas, bloqueios e aumento anormal de envio.

## Plano de implementacao

### Fase 1: Base de cadastro e revisao

- Criar tabelas de solicitacao e grupos aprovados.
- Criar endpoints internos para submeter solicitacao.
- Criar endpoint/admin simples para listar e revisar solicitacoes.
- Salvar configuracao desejada sem ativar envio.

### Fase 2: Entrada controlada em grupos

- Implementar extracao de codigo de convite.
- Adicionar metodo no `WhatsAppConnectionManager` para `groupGetInviteInfo` e `groupAcceptInvite`.
- Ao aprovar, tentar entrada e salvar `groupJid`.
- Adicionar estados de erro e retry manual.

### Fase 3: Vagas multi-grupo

- Buscar destinos ativos de vagas no banco.
- Aplicar filtros por grupo.
- Respeitar limite diario por grupo.
- Manter grupos internos funcionando.
- Testar deduplicacao por destino.

### Fase 4: Eventos multi-grupo

- Migrar `event_notifications` para incluir destino.
- Enviar novos eventos, lembretes e promocoes por grupo ativo.
- Aplicar filtros por localidade/modalidade.
- Garantir que um grupo nao bloqueie notificacao de outro.

### Fase 5: Custos, quotas e seguranca operacional

- Registrar uso de IA por grupo.
- Implementar quota diaria de IA.
- Desativar features caras por padrao.
- Criar dashboard simples de grupos ativos, mensagens/dia e falhas.
- Adicionar pausa manual por grupo.

### Fase 6: Piloto

- Rodar com 2 a 5 comunidades conhecidas.
- Acompanhar envio, falhas de WhatsApp, custo Groq e feedback.
- Ajustar limites antes de abrir novo lote.

## Criterios de aceite do MVP

- Uma pessoa consegue enviar cadastro pela pagina.
- Admin consegue aprovar ou rejeitar.
- Bot so entra no grupo apos aprovacao.
- Grupo aprovado recebe vagas conforme filtros.
- Grupo aprovado recebe eventos conforme configuracao.
- Limite diario por grupo e respeitado.
- Falha do Groq nao impede envio nem remove mensagem indevidamente.
- Admin consegue pausar um grupo.
- Logs mostram mensagens enviadas, falhas e chamadas de IA por grupo.

## Decisao recomendada

Implementar como piloto fechado, nao como abertura publica irrestrita. A funcionalidade e tecnicamente viavel e tem alto valor para faculdades e comunidades de tecnologia, mas o risco operacional com WhatsApp exige aprovacao manual, baixa frequencia, limites por grupo e observabilidade desde o primeiro MVP.
