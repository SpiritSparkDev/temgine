import crypto from 'crypto';
import { prisma } from '../../../lib/prisma';
import { getPicgineConfig } from '../../../lib/picgine';
import { renderLiveSnapshot } from '../../../lib/liveSnapshot';

// Rohen Body selbst lesen — die Signatur gilt für die exakten Bytes.
export const config = { api: { bodyParser: false } };

const MAX_BODY_BYTES = 64 * 1024;
const DEBOUNCE_MS = 5000;

async function readRawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Body zu groß');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// X-Picgine-Signature: sha256=<hex> = HMAC-SHA256(rawBody), Schlüssel = Hex-SHA-256 des
// Client-API-Schlüssels (Picgine speichert nur diesen Hash, SPEC §11.5).
export function verifySignature(rawBody, header, apiKey) {
  if (!apiKey || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const key = crypto.createHash('sha256').update(apiKey).digest('hex');
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  const given = Buffer.from(header.slice(7), 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

async function upsertSetting(key, value) {
  await prisma.setting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } });
}

// Snapshot nur im statischen Modus neu bauen; Status wie pages/api/admin/render-live.js.
async function rebuildSnapshot() {
  const mode = await prisma.setting.findUnique({ where: { key: 'liveRenderMode' } });
  if (mode?.value !== 'static') return;
  const meta = await renderLiveSnapshot();
  const hasErrors = Array.isArray(meta.errors) && meta.errors.length > 0;
  await upsertSetting('liveRenderLastStatus', hasErrors ? 'warning' : 'success');
  await upsertSetting('liveRenderLastAt', meta.renderedAt || new Date().toISOString());
  await upsertSetting('liveRenderLastDurationMs', meta.durationMs || 0);
  await upsertSetting('liveRenderLastRoutes', meta.renderedRoutes || 0);
  await upsertSetting('liveRenderLastErrors', JSON.stringify(meta.errors || []));
  await upsertSetting('liveRenderLastError', hasErrors ? 'Einzelne Seiten konnten nicht gerendert werden' : '');
}

// Entprellt + zusammengefasst: höchstens ein Rebuild gleichzeitig; Webhooks während eines
// laufenden Rebuilds lösen genau einen weiteren aus.
// ponytail: prozesslokaler Zustand, kennt den manuellen Rebuild (render-live) nicht — bei
// mehreren Instanzen oder Kollisionen gemeinsame Sperre in der DB.
let timer = null;
let running = false;
let again = false;
export function scheduleRebuild(rebuild = rebuildSnapshot, delayMs = DEBOUNCE_MS) {
  if (running) { again = true; return; }
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    running = true;
    try {
      await rebuild();
    } catch (e) {
      console.error('[picgine-webhook] Snapshot-Rebuild fehlgeschlagen', e?.message);
    } finally {
      running = false;
      if (again) { again = false; scheduleRebuild(rebuild, delayMs); }
    }
  }, delayMs);
}

// Öffentlich, aber signiert: Picgine meldet Änderungen an Galerien (SPEC §11.5).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });

  let raw;
  try {
    raw = await readRawBody(req);
  } catch (_e) {
    return res.status(413).json({ error: 'Anfrage zu groß' });
  }

  const { apiKey } = await getPicgineConfig();
  if (!verifySignature(raw, req.headers['x-picgine-signature'], apiKey)) {
    return res.status(401).json({ error: 'Ungültige Signatur' });
  }

  scheduleRebuild();
  return res.status(202).json({ ok: true });
}
