# Memes

Esta pasta guarda os arquivos de imagem que o bot pode enviar como meme nos grupos de Networking.

## Como adicionar memes

1. Crie uma subpasta por categoria, por exemplo:

```text
assets/memes/
  backend/
    deploy-sexta.jpg
  frontend/
    centralizar-div.png
  geral/
    stackoverflow.gif
```

2. Rode `npm run memes:sync` para registrar os arquivos novos no banco (usa o nome da subpasta como categoria; legenda fica em branco, edite depois via banco se quiser uma legenda específica).

3. Ative o envio com `MEMES_SEND_ENABLED=true` no `.env.local`. Enquanto essa flag estiver `false` (padrão), memes nunca são enviados, mesmo que existam registrados.

Formatos aceitos: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`.

## Como funciona o envio

Memes entram na mistura de conteúdo de ociosidade do networking (`NetworkingIdleService`), junto com piada/crítica/enquete/notícia, com uma chance configurável por `MEMES_CHANCE` (padrão 10%). O meme escolhido é sempre o que está há mais tempo sem ser usado (ou nunca usado) — sem repetir o mesmo toda hora.
