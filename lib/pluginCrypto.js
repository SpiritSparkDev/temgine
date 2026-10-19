// AES-256-GCM-Verschlüsselung für Secrets in Settings/Plugin-Konfiguration.
// Schlüssel per HKDF aus NEXTAUTH_SECRET. Blob-Format "v1:<iv>:<tag>:<ciphertext>" (base64).
// Als ctx.crypto für Plugin-Handler/Hooks verfügbar; lib/tntInquiriesConfig.js nutzt dieselben Funktionen.
import crypto from 'crypto';

function key() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NO_SECRET');
  // Info-String bleibt "tnt-inquiries-v1", damit bereits gespeicherte Blobs lesbar bleiben.
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'temgine', 'tnt-inquiries-v1', 32));
}

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), ct].map((p) => (Buffer.isBuffer(p) ? p.toString('base64') : p)).join(':');
}

export function decrypt(blob) {
  const [v, iv, tag, ct] = String(blob || '').split(':');
  if (v !== 'v1' || !ct) throw new Error('BAD_BLOB');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}
