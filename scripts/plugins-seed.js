#!/usr/bin/env node
/**
 * Läuft beim Start (server.js) nach den DB-Migrationen: führt plugins/<id>/seed.cjs aus, falls vorhanden.
 * Ein Seed übernimmt einmalig alte Kern-Settings in die Plugin-Keys (z. B. tnt-inquiries) und muss
 * idempotent sein: module.exports = async (prisma) => {}. Fehler werden nur geloggt, nie geworfen.
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const PLUGINS = path.join(__dirname, '..', 'plugins');

async function main() {
  const seeds = fs.existsSync(PLUGINS)
    ? fs.readdirSync(PLUGINS).map((id) => [id, path.join(PLUGINS, id, 'seed.cjs')]).filter(([, file]) => fs.existsSync(file))
    : [];
  if (!seeds.length) return;
  const prisma = new PrismaClient();
  try {
    for (const [id, file] of seeds) {
      try {
        const r = await require(file)(prisma);
        if (r && r.migrated) console.log(`> [plugins-seed] ${id}: Einstellungen übernommen`);
      } catch (e) {
        console.warn(`> [plugins-seed] ${id}: ${e.message}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => console.warn('> [plugins-seed]', e.message));
