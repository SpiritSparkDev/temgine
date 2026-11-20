// Regeln und Zwischenspeicher für den gestückelten Upload (WP-B2). Keine Temgine-Importe.
// Teile liegen nur im Arbeitsspeicher; auf die Platte (public/uploads) kommt erst die fertig geprüfte Datei
// (core.uploads.commit). Abbruch, Ablauf oder Neustart hinterlassen deshalb nie Teildateien.

// Teilgröße: base64 von 700 000 Byte = 933 336 Zeichen, plus JSON-Hülle unter dem 1-MB-Limit der Plugin-Routen.
export const CHUNK_SIZE = 700000;
export const MAX_CHUNK = 700 * 1024; // Obergrenze, die der Server pro Teil akzeptiert
export const TTL_MS = 15 * 60 * 1000;
export const MAX_SESSIONS = 10;
export const MAX_DEPTH = 5;
export const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'];

// Wie Temgines normalizeUploadSegment (pages/api/files.js): Umlaute aufgelöst, Rest außerhalb [A-Za-z0-9._-] -> "_".
export function normalizeSegment(input) {
  return String(input || '').normalize('NFC')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

// -> { name, ext } oder { error }. Nur die Endung zählt für den Typ; Punkte im Namen werden entschärft ("a.php.jpg" -> "a_php.jpg").
export function cleanFileName(raw) {
  const last = String(raw || '').replace(/\\/g, '/').split('/').pop();
  const dot = last.lastIndexOf('.');
  const ext = dot > 0 ? last.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  if (!ALLOWED_EXT.includes(ext)) return { error: `Dateityp nicht erlaubt (erlaubt: ${ALLOWED_EXT.join(', ')})` };
  const base = normalizeSegment(last.slice(0, dot)).replace(/\./g, '_').replace(/^_+|_+$/g, '') || 'upload';
  return { name: `${base.slice(0, 80)}.${ext}`, ext };
}

// Zielordner relativ zu public/uploads -> { folder } ('' = Wurzel) oder { error }. Kein "..", keine absoluten Pfade, keine Laufwerke.
export function cleanFolder(raw) {
  const s = String(raw ?? '').replace(/\\/g, '/');
  if (s.includes('\u0000')) return { error: 'Ungültiger Ordner' };
  const parts = s.split('/').filter(Boolean);
  if (parts.length > MAX_DEPTH || parts.some((p) => p === '.' || p === '..' || /[:*?"<>|\u0000-\u001f]/.test(p))) return { error: 'Ungültiger Ordner' };
  return { folder: parts.join('/') };
}

const startsWith = (buf, bytes, at = 0) => bytes.every((b, i) => buf[at + i] === b);
const ascii = (buf, from, to) => buf.subarray(from, to).toString('latin1');

const SVG_START = /^﻿?\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i;
const SVG_FORBIDDEN = [
  [/<\s*script/i, 'Script'], [/\bon[a-z]+\s*=/i, 'Ereignis-Attribut'], [/javascript\s*:/i, 'javascript:-Adresse'],
  [/<\s*(foreignObject|iframe|embed|object|audio|video)\b/i, 'eingebetteter Inhalt'], [/<!ENTITY/i, 'Entity-Definition'],
  [/@import/i, '@import'], [/&#x?[0-9a-f]+;/i, 'Zeichenverschleierung'],
  [/href\s*=\s*["']\s*(?!#|data:image\/(?:png|jpe?g|gif|webp);base64,)/i, 'externe Verweise'],
];

// Inhalt gegen die Endung prüfen (Magic Bytes; SVG = Text ohne aktive Inhalte) -> null oder Fehlertext.
export function sniff(buf, ext) {
  const ok = {
    jpg: () => startsWith(buf, [0xff, 0xd8, 0xff]), jpeg: () => startsWith(buf, [0xff, 0xd8, 0xff]),
    png: () => startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    gif: () => ascii(buf, 0, 4) === 'GIF8',
    webp: () => ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP',
    avif: () => ascii(buf, 4, 8) === 'ftyp' && /avif|avis/.test(ascii(buf, 8, 32)),
  };
  if (ext === 'svg') {
    const text = buf.toString('utf8');
    if (!SVG_START.test(text)) return 'Keine gültige SVG-Datei';
    const bad = SVG_FORBIDDEN.find(([re]) => re.test(text));
    return bad ? `SVG enthält nicht erlaubten Inhalt (${bad[1]})` : null;
  }
  return ok[ext]?.() ? null : 'Dateiinhalt passt nicht zur Endung';
}

// Sitzungen: globalThis, damit alle Bundles/Neuaufrufe in einem Prozess denselben Speicher sehen.
const sessions = globalThis.__designerApiUploads || (globalThis.__designerApiUploads = new Map());

export function sweep(now) {
  for (const [id, s] of sessions) if (s.expires <= now) sessions.delete(id);
}

export const sessionCount = () => sessions.size;
export const getSession = (id, user, now) => {
  sweep(now);
  const s = sessions.get(id);
  return s && s.user === user ? s : null;
};
export const dropSession = (id) => sessions.delete(id);

export function createSession({ id, user, name, ext, folder, size }, now) {
  sweep(now);
  if (sessions.size >= MAX_SESSIONS) return null;
  const s = { id, user, name, ext, folder, size, chunkSize: CHUNK_SIZE, parts: new Map(), expires: now + TTL_MS };
  sessions.set(id, s);
  return s;
}

export const partCount = (s) => Math.ceil(s.size / s.chunkSize);
export const expectedPartSize = (s, i) => Math.min(s.chunkSize, s.size - i * s.chunkSize);
