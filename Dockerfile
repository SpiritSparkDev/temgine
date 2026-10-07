FROM node:20-slim
WORKDIR /app

# Prisma's query engine needs libssl; Debian 12 (bookworm) doesn't ship it by default.
# libvips-dev + build-essential + python3 + pkg-config: `sharp` normally downloads a
# prebuilt libvips binary from GitHub Releases during `npm install`. If that download
# fails (e.g. a transient 503 from GitHub's release CDN), npm falls back to compiling
# sharp against libvips from source — which needs these present to succeed.
RUN apt-get update -y && apt-get install -y openssl libvips-dev build-essential python3 pkg-config && rm -rf /var/lib/apt/lists/*

# package.json + Lockfile + scripts/ first so `npm ci` is its own cached layer —
# rebuilds after source-only changes skip reinstalling dependencies.
# `npm ci` installiert exakt den Stand aus package-lock.json (reproduzierbar).
COPY package.json package-lock.json ./
COPY scripts/ ./scripts/
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "server.js"]
