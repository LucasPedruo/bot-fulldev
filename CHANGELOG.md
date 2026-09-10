# Changelog

Toda atualização do Quackson entra aqui. A entrada da versão que está no `package.json` é lida no
boot e anunciada uma única vez nos grupos configurados, então **escreva pensando em quem vai ler no
WhatsApp**: frases curtas, sem jargão interno, sem nome de arquivo.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento é
[semântico](https://semver.org/lang/pt-BR/).

## [0.4.2] - 2026-09-10

### Alterado

- O aviso de lista de espera agora aparece só quando alguém sai do grupo, e não mais de tempos em tempos.
- O grupo de vagas da faculdade não recebe mais aprovação automática de entrada.

## [0.4.1] - 2026-09-10

### Corrigido

- Pedidos de entrada que o WhatsApp recusava agora são tentados novamente pelo número de telefone.

## [0.4.0] - 2026-09-10

### Adicionado

- Pedidos de entrada nos grupos de vagas agora também são aprovados automaticamente.
- Figurinhas animadas agora ganham descrição de acessibilidade (antes falhavam).

## [0.3.1] - 2026-09-10

### Corrigido

- Figurinhas nos grupos de vagas agora são removidas de verdade.
- Imagens que não podiam ser baixadas voltaram a funcionar.

## [0.3.0] - 2026-09-10

### Adicionado

- Moderação nos grupos de vagas: mensagem que não é vaga é apagada e o autor entra na malha fina.
  Na terceira vez o membro é removido e fica 14 dias sem poder voltar. Administradores são isentos.
- Acessibilidade: imagens e figurinhas enviadas nos grupos agora ganham uma descrição em texto,
  para quem usa leitor de tela.

### Removido

- O aviso de atualização do bot não é mais enviado nos grupos.

## [0.2.1] - 2026-09-10

### Adicionado

- O Quackson agora se apresenta e explica como funciona nos grupos da faculdade.

### Corrigido

- Celulares brasileiros no formato antigo (8 dígitos) não são mais barrados na entrada dos grupos.

## [0.2.0] - 2026-09-10

### Adicionado

- Pedidos de entrada nos grupos de networking agora são aprovados automaticamente quando o número
  parece ser de uma pessoa real e ainda há vaga no grupo.
- Aviso automático quando o grupo lota e tem gente na fila de espera.
- Resumo automático dos eventos e oportunidades divulgados no grupo de representantes de eixo.
- Mensagem de apresentação quando o Quackson entra em um grupo novo.
- Aviso de atualização com a versão e o resumo das mudanças (esta mensagem).

### Alterado

- O Quackson agora tem nome, personalidade e sabe explicar o que é a Comunidade FullDev quando
  alguém o menciona.

### Removido

- Mensagem de despedida quando alguém sai do grupo.
