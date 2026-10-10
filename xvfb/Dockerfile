FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium xvfb x11-utils ffmpeg fonts-liberation fonts-noto-core fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install
COPY navegar.js gravar.sh ./
CMD ["/app/gravar.sh"]
