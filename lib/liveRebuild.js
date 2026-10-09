/**
 * lib/liveRebuild.js
 *
 * Zentraler Neubau des Live-Snapshots (lib/liveSnapshot.js) inkl. Status-Settings
 * liveRenderLast*. Nie zwei Neubauten gleichzeitig:
 *   - rebuildLiveSnapshot()                    — entprellt (5 s) und zusammengefasst, nur im
 *     statischen Modus (Picgine-Webhook, später ctx.rebuildSnapshot() für Plugins). Kommt der
 *     Aufruf während eines laufenden Neubaus, folgt genau ein weiterer.
 *   - rebuildLiveSnapshot({ immediate: true }) — manueller Neubau (Admin „Live rendern“):
 *     läuft sofort, aktiviert den statischen Modus, liefert die Meta-Daten; null, wenn
 *     bereits ein Neubau läuft.
 * ponytail: prozesslokaler Zustand — bei mehreren Instanzen gemeinsame Sperre in der DB.
 */
import { prisma } from './prisma';
import { renderLiveSnapshot } from './liveSnapshot';

const DEBOUNCE_MS = 5000;

async function upsertSetting(key, value) {
  await prisma.setting.upsert({ where: { key: String(key) }, update: { value: String(value) }, create: { key: String(key), value: String(value) } });
}

async function writeResult(meta) {
  const hasErrors = Array.isArray(meta.errors) && meta.errors.length > 0;
  await upsertSetting('liveRenderLastStatus', hasErrors ? 'warning' : 'success');
  await upsertSetting('liveRenderLastAt', meta.renderedAt || new Date().toISOString());
  await upsertSetting('liveRenderLastDurationMs', meta.durationMs || 0);
  await upsertSetting('liveRenderLastRoutes', meta.renderedRoutes || 0);
  await upsertSetting('liveRenderLastErrors', JSON.stringify(meta.errors || []));
  await upsertSetting('liveRenderLastError', hasErrors ? 'Einzelne Seiten konnten nicht gerendert werden' : '');
}

async function rebuildManual() {
  try {
    await upsertSetting('liveRenderLastStatus', 'running');
    await upsertSetting('liveRenderLastError', '');
    const meta = await renderLiveSnapshot();
    await upsertSetting('liveRenderMode', 'static');
    await writeResult(meta);
    return meta;
  } catch (e) {
    await upsertSetting('liveRenderLastStatus', 'error');
    await upsertSetting('liveRenderLastError', String(e?.message || 'Render fehlgeschlagen'));
    throw e;
  }
}

async function rebuildIfStatic() {
  const mode = await prisma.setting.findUnique({ where: { key: 'liveRenderMode' } });
  if (mode?.value !== 'static') return;
  await writeResult(await renderLiveSnapshot());
}

let timer = null;
let running = false;
let pending = null; // während eines laufenden Neubaus angefordert → danach genau einer

async function run(rebuild) {
  running = true;
  try {
    return await rebuild();
  } finally {
    running = false;
    if (pending) {
      const { rebuild: next, delayMs } = pending;
      pending = null;
      schedule(next, delayMs);
    }
  }
}

function schedule(rebuild, delayMs) {
  if (running) { pending = { rebuild, delayMs }; return; }
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (running) { pending = { rebuild, delayMs }; return; }
    run(rebuild).catch((e) => console.error('[live-rebuild] Snapshot-Rebuild fehlgeschlagen', e?.message));
  }, delayMs);
}

// `rebuild`/`delayMs` nur für Tests.
export function rebuildLiveSnapshot({ immediate = false, rebuild, delayMs = DEBOUNCE_MS } = {}) {
  if (immediate) return running ? Promise.resolve(null) : run(rebuild || rebuildManual);
  schedule(rebuild || rebuildIfStatic, delayMs);
  return undefined;
}
