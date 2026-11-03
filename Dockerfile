FROM node:22.23.4-slim
WORKDIR /app

# git: Einstellungen → Plugins → Git-Quellen klont Plugin-Repos (data/plugin-sources/).
# Prisma's query engine needs libssl; Debian 12 (bookworm) doesn't ship it by default.
# libvips-dev + build-essential + python3 + pkg-config: `sharp` normally downloads a
# prebuilt libvips binary from GitHub Releases during `npm install`. If that download
# fails (e.g. a transient 503 from GitHub's release CDN), npm falls back to compiling
# sharp against libvips from source — which needs these present to succeed.
RUN apt-get update -y && apt-get install -y openssl git libvips-dev build-essential python3 pkg-config && rm -rf /var/lib/apt/lists/*

# package.json + Lockfile + scripts/ first so `npm ci` is its own cached layer —
# rebuilds after source-only changes skip reinstalling dependencies.
# `npm ci` installiert exakt den Stand aus package-lock.json (reproduzierbar).
COPY package.json package-lock.json ./
COPY scripts/ ./scripts/
RUN npm ci

COPY . .
# Geholte Git-Plugins (data/plugin-sources/, siehe .dockerignore) vor dem Build nach plugins/ kopieren.
# Ein ungültiges Plugin wird nicht kopiert und darf den Build nicht stoppen.
RUN node scripts/plugins-sync.js || true
RUN npm run build

EXPOSE 3000
CMD ["node", "server.js"]
