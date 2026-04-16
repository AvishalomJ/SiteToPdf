FROM node:20-slim

# Install Playwright Chromium dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
    fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files for dependency install
COPY package.json package-lock.json* ./
COPY web/server/package.json web/server/package-lock.json* ./web/server/

# Install root deps (Playwright, Cheerio, etc.)
RUN npm ci --ignore-scripts

# Install server deps
WORKDIR /app/web/server
RUN npm ci --ignore-scripts
WORKDIR /app

# Install Playwright Chromium
RUN npx playwright install chromium

# Copy source and config
COPY tsconfig.json ./
COPY src/ ./src/
COPY web/server/ ./web/server/
COPY web/frontend/ ./web/frontend/

# Build root TypeScript (src/ → dist/)
RUN npx tsc

# Build server TypeScript (web/server/ → dist/web/server/)
RUN cd web/server && npx tsc

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/web/server/server.js"]
