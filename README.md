# gravatelanavegador

Grava em vídeo a navegação de um Chromium automatizado, rodando em Docker em máquina **ARM64** (aarch64).

Tem duas versões, que gravam coisas diferentes, e uma terceira (`teams/`) que entra numa reunião do Microsoft Teams e grava tela **e áudio**:

| | Playwright (`/`) | Xvfb + FFmpeg (`xvfb/`) |
|---|---|---|
| O que aparece no vídeo | só o conteúdo da página | a tela inteira: janela, abas, barra de endereço, pop-ups |
| Navegador | Chromium headless baixado pelo Playwright | Chromium do Debian (`apt`), com janela, dentro de um display virtual |
| Quem grava | o próprio Playwright (`recordVideo`) | FFmpeg capturando o display X11 |
| Formato | `.webm` (VP8) | `.mp4` (H.264) |
| Peças | Node | Node + Xvfb + FFmpeg + script bash |
| Quando usar | caso geral: registrar o que aconteceu na página | quando precisar mostrar o navegador inteiro ou diálogos nativos |

Se só precisa registrar a página, use o Playwright: tem menos peças e menos pontos de falha.

## Requisitos

- Docker
- Máquina ARM64 (Hetzner CAX, AWS Graviton, Raspberry Pi 4/5, Mac Apple Silicon) **ou** máquina x86 com emulação ARM (ver [Testar em x86 com emulação](#testar-em-x86-com-emulação))

## Versão 1: Playwright

Arquivos: `gravar.js`, `package.json`, `Dockerfile`.

```bash
docker build -t gravatela .
docker run --rm --ipc=host -v "$PWD/videos:/app/videos" gravatela
```

Para gravar outra URL:

```bash
docker run --rm --ipc=host -e URL=https://seu-site.com -v "$PWD/videos:/app/videos" gravatela
```

Saída em `videos/`:

- `<hash>.webm`: o vídeo
- `screenshot.png`: captura da página no fim do roteiro

Como funciona:

1. O contexto do navegador é criado com `recordVideo` e com `viewport` igual ao tamanho do vídeo. Se forem diferentes, o vídeo sai reescalado ou com bordas.
2. O roteiro roda: abre a URL, espera, rola a página.
3. `context.close()` grava o arquivo de vídeo. Sem isso o vídeo pode não ser salvo, por isso ele vem antes de `browser.close()`.
4. `page.video().path()` informa o nome do arquivo gerado.

A imagem usa `npx playwright install --with-deps chromium`, que baixa o Chromium arm64 e instala as bibliotecas de sistema pelo `apt`. Por isso a imagem base precisa ser Debian ou Ubuntu.

## Versão 2: Xvfb + FFmpeg

Arquivos em `xvfb/`: `navegar.js`, `gravar.sh`, `package.json`, `Dockerfile`.

```bash
cd xvfb
docker build -t gravatela-xvfb .
docker run --rm --shm-size=1g -v "$PWD/videos:/app/videos" gravatela-xvfb
```

Variáveis de ambiente:

| Variável | Padrão | Efeito |
|---|---|---|
| `URL` | `https://example.com` | página a abrir |
| `FPS` | `15` | quadros por segundo da gravação |
| `RES` | `1280x720` | resolução do display virtual, da captura e da janela do Chromium |
| `QEMU` | vazio | `1` só ao rodar emulado em x86 |

Saída em `videos/`:

- `gravacao-AAAAMMDD-HHMMSS.mp4`: o vídeo
- `screenshot.png`: captura da página no fim do roteiro

Como funciona (`gravar.sh`):

1. Sobe o Xvfb no display `:99` e espera ele responder (`xdpyinfo`). Se o FFmpeg começar antes, falha.
2. Inicia o FFmpeg capturando `:99` (`x11grab`, `libx264 -preset ultrafast`).
3. Roda `navegar.js`: Puppeteer abre o Chromium **com janela** (`headless: false`) nesse display. Em modo headless nada seria desenhado no Xvfb e o vídeo sairia preto.
4. Encerra o FFmpeg com `kill -INT`, para ele fechar o MP4 direito, e depois o Xvfb.

Detalhes do `navegar.js`:

- `puppeteer-core` + `executablePath: '/usr/bin/chromium'`, porque o Puppeteer não baixa Chrome para Linux ARM64. O Chromium vem do `apt`.
- `--no-sandbox`: o container roda como root e o Chromium se recusa a abrir como root sem essa flag.
- `--test-type`: esconde a faixa de aviso que o `--no-sandbox` mostra.
- `ignoreDefaultArgs: ['--enable-automation']`: esconde a faixa "Chrome is being controlled by automated test software".
- Fontes `fonts-noto-core` (árabe e outros alfabetos) e `fonts-noto-cjk` (chinês, japonês, coreano). Sem elas, esses textos aparecem como quadrados no vídeo.

## Versão 3: reunião do Teams com áudio

Arquivos em `teams/`: `entrar.js`, `gravar.sh`, `package.json`, `Dockerfile`.

Baseada na versão 2, porque o `recordVideo` do Playwright não grava áudio.

```bash
cd teams
docker build -t gravatela-teams .
docker run --rm --shm-size=1g \
  -e URL='https://teams.microsoft.com/l/meetup-join/...' \
  -e NOME=Gravador \
  -v "$PWD/videos:/app/videos" gravatela-teams
```

| Variável | Padrão | Efeito |
|---|---|---|
| `URL` | obrigatória | link da reunião (`teams.microsoft.com`, `teams.live.com` ou `teams.cloud.microsoft`); outra URL só é aberta e gravada por `DURACAO` |
| `NOME` | `Gravador` | nome exibido aos participantes |
| `DURACAO` | `3600` | tempo máximo de gravação, em segundos |
| `ESPERA_LOBBY` | `600` | tempo máximo esperando ser admitido, em segundos |
| `RES`, `FPS`, `QEMU` | como na versão 2 | |

Saída em `videos/`:

- `gravacao-AAAAMMDD-HHMMSS.mp4`: vídeo H.264 + áudio AAC, MP4 fragmentado (continua tocável se o processo cair no meio)
- `etapa-*.png`: captura de cada etapa (launcher, pré-entrada, lobby, reunião, fim ou erro), para diagnosticar onde parou

Como funciona:

1. `gravar.sh` sobe o PulseAudio com duas saídas virtuais: `gravacao` (padrão, onde o Chromium toca o som da reunião) e `microfone` (silenciosa).
2. O FFmpeg grava a tela do Xvfb e o `gravacao.monitor` no mesmo arquivo.
3. `entrar.js` abre o link, clica em "Continue on this browser" se aparecer, preenche o nome, desliga câmera e microfone e clica em "Join now".
4. Espera no lobby até ser admitido ou até `ESPERA_LOBBY`.
5. Grava até a reunião terminar, o bot ser removido, ou `DURACAO`; então clica em sair.

Detalhes:

- `--use-fake-device-for-media-stream` com `--use-file-for-fake-audio-capture=/app/silencio.wav`: dá ao Teams uma câmera e um microfone falsos. Sem eles o Teams abre o diálogo "Are you sure you don't want audio or video?". O microfone toca silêncio, então nada vaza para a reunião mesmo se o toggle falhar.
- Os seletores usam `data-tid` do Teams (`prejoin-display-name-input`, `toggle-mute`, `toggle-video`, `prejoin-join-button`, `joinOnWeb`) com texto em inglês e português como alternativa. O navegador é forçado para `en-US`.
- O bot entra como convidado anônimo: cai no lobby e alguém precisa admiti-lo. Se a organização bloquear convidados anônimos, ele não entra.
- O nome do bot aparece na lista de participantes. Avise os participantes de que a reunião será gravada.

Testado (2026-10-09), em amd64 e em Hetzner CAX11 (ARM nativo):

- áudio: página tocando 440 Hz gravada com volume médio de −3,6 dB
- Teams com link inválido: launcher, nome, toggles desligados e "Join now" funcionaram; a falha de conexão foi detectada e o script encerrou
- **ainda não testado em reunião real**

## Mudar o roteiro de navegação

O roteiro fica em `gravar.js` (Playwright) ou em `xvfb/navegar.js` (Puppeteer), entre o `goto` e o `screenshot`. Mantenha esperas entre as ações: se o roteiro abrir e fechar a página direto, o vídeo fica com menos de 1 segundo.

## Testar em x86 com emulação

1. Registre o emulador ARM64 no host (vale até o host ou o WSL reiniciar):

   ```bash
   docker run --privileged --rm tonistiigi/binfmt --install arm64
   ```

2. Faça o build com `--platform linux/arm64` e rode com `--platform linux/arm64 -e QEMU=1`:

   ```bash
   docker build --platform linux/arm64 -t gravatela:arm64 .
   docker run --rm --platform linux/arm64 --ipc=host -e QEMU=1 -v "$PWD/videos:/app/videos" gravatela:arm64
   ```

Sem `QEMU=1` o Chromium cai com `FATAL: zygote_main_linux.cc ... Check failed: sandbox::ThreadHelpers::IsSingleThreaded()`. É defeito da emulação, não do ARM; a variável liga `--no-zygote`. **Em ARM real, não passe `QEMU=1`.**

A emulação é lenta: o Chromium leva uns 25 segundos para abrir, e esse tempo aparece como tela preta no começo do vídeo da versão Xvfb.

## Resultados medidos

| Ambiente | Versão | Build | Gravação |
|---|---|---|---|
| x86 + QEMU (WSL2) | Playwright | ~6 min | 43 s |
| x86 + QEMU (WSL2) | Xvfb + FFmpeg | — | 48 s |
| Hetzner CAX11 (ARM nativo, 2 vCPU, 4 GB) | Playwright | 82 s | 6 s |
| Hetzner CAX11 (ARM nativo, 2 vCPU, 4 GB) | Xvfb + FFmpeg | 103 s | 6 s |
| Hetzner CAX11 (ARM nativo, 2 vCPU, 4 GB) | Xvfb + FFmpeg, `RES=1920x1080` | — | 6 s |

## Problemas conhecidos

| Sintoma | Causa | Correção |
|---|---|---|
| `browser.newContext: Target page, context or browser has been closed` em x86 | Chromium caiu sob QEMU (zygote) | rodar com `-e QEMU=1` |
| `Running as root without --no-sandbox is not supported` | Chromium como root no container | `--no-sandbox` (já está em `navegar.js`) |
| Vídeo do Xvfb todo preto | navegador em headless, ou FFmpeg iniciou antes do Xvfb | `headless: false`; esperar `xdpyinfo` responder |
| Quadrados no lugar de letras | faltam fontes | `fonts-noto-core`, `fonts-noto-cjk` |
| Vídeo do Playwright vazio ou ausente | browser fechado sem fechar o contexto | `await context.close()` antes de `browser.close()` |
| Chromium travando por falta de memória compartilhada | `/dev/shm` pequeno no Docker | `--ipc=host` ou `--shm-size=1g` |
