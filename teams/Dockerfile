FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium xvfb x11-utils ffmpeg pulseaudio pulseaudio-utils \
      fonts-liberation fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

RUN ffmpeg -loglevel error -f lavfi -i anullsrc=r=48000:cl=mono -t 1 /app/silencio.wav
COPY package.json ./
RUN npm install
COPY entrar.js gravar.sh ./
CMD ["/app/gravar.sh"]
