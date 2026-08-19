FROM node:20-slim
WORKDIR /app

# Prisma's query engine needs libssl; Debian 12 (bookworm) doesn't ship it by default.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# package.json + scripts/ first so `npm install` is its own cached layer —
# rebuilds after source-only changes skip reinstalling dependencies.
# (No package-lock.json in this repo, so `npm ci` isn't an option here.)
COPY package.json ./
COPY scripts/ ./scripts/
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "server.js"]
