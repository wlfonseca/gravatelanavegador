FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install && npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
COPY gravar.js ./
CMD ["node", "gravar.js"]
