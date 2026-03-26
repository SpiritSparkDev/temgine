#!/usr/bin/env node
// Migration helper for Plesk deployments.
// Plesk injects ENV vars into the app process but not into npm script shells.
// This script loads .env / .env.local first so Prisma CLI can find DATABASE_URL.

try { require('dotenv').config({ path: '.env.local' }); } catch (_) {}
try { require('dotenv').config(); } catch (_) {}

if (!process.env.DATABASE_URL) {
  console.error('[migrate] ERROR: DATABASE_URL ist nicht gesetzt.');
  console.error('[migrate] Stelle sicher, dass DATABASE_URL als ENV-Variable in Plesk konfiguriert ist,');
  console.error('[migrate] oder lege eine .env Datei im App-Verzeichnis an.');
  process.exit(1);
}

const { execSync } = require('child_process');
const prismaBin = require('path').join(__dirname, '..', 'node_modules', '.bin', 'prisma');

console.log('[migrate] DATABASE_URL gefunden, starte Prisma migrate deploy...');
try {
  execSync(`"${prismaBin}" migrate deploy`, {
    stdio: 'inherit',
    env: process.env,
  });
  console.log('[migrate] Migration erfolgreich.');
} catch (e) {
  console.error('[migrate] Migration fehlgeschlagen:', e.message);
  process.exit(1);
}
