#!/usr/bin/env node
// Convenience wrapper around `docker compose up`:
// - creates .env.local from .env.local.example on first run (with a generated NEXTAUTH_SECRET)
// - picks free host ports for APP_PORT/DATABASE_PORT if the defaults (3000/5432) are taken
'use strict';

const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

function isPortFree(port) {
  // No host arg -> binds all interfaces (0.0.0.0), matching how Docker
  // publishes ports. Binding only to 127.0.0.1 misses ports already taken
  // by other containers, which publish on 0.0.0.0 too.
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port);
  });
}

async function findFreePort(start) {
  let port = start;
  while (!(await isPortFree(port))) port++;
  return port;
}

function ensureEnvLocal() {
  if (fs.existsSync('.env.local')) return;
  if (!fs.existsSync('.env.local.example')) {
    console.error('docker-up: .env.local.example nicht gefunden, kann .env.local nicht anlegen.');
    process.exit(1);
  }
  const secret = crypto.randomBytes(32).toString('base64');
  const content = fs
    .readFileSync('.env.local.example', 'utf8')
    .replace(/^NEXTAUTH_SECRET=.*$/m, `NEXTAUTH_SECRET=${secret}`);
  fs.writeFileSync('.env.local', content);
  console.log('docker-up: .env.local aus .env.local.example erstellt (NEXTAUTH_SECRET generiert).');
}

// DATABASE_URL in .env.local is the single source of truth for DB credentials.
// The Postgres image itself still needs them as separate POSTGRES_USER/
// PASSWORD/DB vars, so derive those from DATABASE_URL instead of asking for
// both forms to be kept in sync by hand.
function readEnvLocalValue(key) {
  if (!fs.existsSync('.env.local')) return null;
  const match = fs.readFileSync('.env.local', 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

function parseDbCredentials(raw) {
  if (!raw) return {};
  try {
    const url = new URL(raw);
    return {
      DATABASE_USER: decodeURIComponent(url.username) || undefined,
      DATABASE_PASSWORD: decodeURIComponent(url.password) || undefined,
      DATABASE_NAME: url.pathname.replace(/^\//, '') || undefined,
    };
  } catch {
    return {};
  }
}

function dbCredentialsFromUrl() {
  const raw = readEnvLocalValue('DATABASE_URL');
  const parsed = parseDbCredentials(raw);
  if (raw && Object.keys(parsed).length === 0) {
    console.warn('docker-up: DATABASE_URL in .env.local konnte nicht geparst werden, nutze Defaults.');
  }
  return parsed;
}

async function main() {
  ensureEnvLocal();

  const appPort = await findFreePort(Number(process.env.APP_PORT) || 3000);
  const dbPort = await findFreePort(Number(process.env.DATABASE_PORT) || 5432);
  console.log(`docker-up: APP_PORT=${appPort} DATABASE_PORT=${dbPort}`);

  // Explicit shell env vars win; otherwise fall back to DATABASE_URL from
  // .env.local; docker-compose.yml's own defaults (temgine/temgine_dev) are
  // the last resort.
  const derived = dbCredentialsFromUrl();
  const dbEnv = {};
  for (const key of ['DATABASE_USER', 'DATABASE_PASSWORD', 'DATABASE_NAME']) {
    if (process.env[key]) dbEnv[key] = process.env[key];
    else if (derived[key]) dbEnv[key] = derived[key];
  }

  const result = spawnSync('docker', ['compose', 'up', '-d', '--build'], {
    stdio: 'inherit',
    env: { ...process.env, ...dbEnv, APP_PORT: String(appPort), DATABASE_PORT: String(dbPort) },
  });

  if (result.status === 0) {
    console.log(`\ndocker-up: fertig -> http://localhost:${appPort}`);
  }
  process.exit(result.status ?? 1);
}

if (require.main === module) {
  main();
} else {
  module.exports = { parseDbCredentials };
}
