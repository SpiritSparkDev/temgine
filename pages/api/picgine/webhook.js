import crypto from 'crypto';
import { getPicgineConfig } from '../../../lib/picgine';
import { rebuildLiveSnapshot } from '../../../lib/liveRebuild';

// Rohen Body selbst lesen — die Signatur gilt für die exakten Bytes.
export const config = { api: { bodyParser: false } };

const MAX_BODY_BYTES = 64 * 1024;

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

  rebuildLiveSnapshot(); // entprellt, nur im statischen Modus
  return res.status(202).json({ ok: true });
}
