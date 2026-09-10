# Changelog

Toda atualização do Quackson entra aqui. A entrada da versão que está no `package.json` é lida no
boot e anunciada uma única vez nos grupos configurados, então **escreva pensando em quem vai ler no
WhatsApp**: frases curtas, sem jargão interno, sem nome de arquivo.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento é
[semântico](https://semver.org/lang/pt-BR/).

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
