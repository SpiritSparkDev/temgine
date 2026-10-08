import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { prisma } from './prisma';
import { resolveSafeDir } from './uploadFolder';

// Add-on "Externe Quellen": Dateien/Ordner von SFTP, Nextcloud (WebDAV) oder S3
// in public/uploads/ importieren. Quellen liegen als JSON in der Setting-Tabelle
// (Key external_sources) und werden von /api/settings nie herausgegeben.

export const ENABLED_KEY = 'external_sources_enabled';
export const SOURCES_KEY = 'external_sources';
export const SECRET_FIELDS = { sftp: ['password', 'privateKey'], nextcloud: ['password'], s3: ['secretAccessKey'] };

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 1000;
const TIMEOUT_MS = 15000;

export async function isEnabled() {
  const row = await prisma.setting.findUnique({ where: { key: ENABLED_KEY } });
  return row?.value === 'true';
}

export async function loadSources() {
  const row = await prisma.setting.findUnique({ where: { key: SOURCES_KEY } });
  try { return JSON.parse(row?.value || '[]'); } catch { return []; }
}

export const saveSources = (sources) => prisma.setting.upsert({
  where: { key: SOURCES_KEY },
  update: { value: JSON.stringify(sources) },
  create: { key: SOURCES_KEY, value: JSON.stringify(sources) },
});

/** Relativer Pfad ohne "..", ohne führende/doppelte Slashes. */
export function cleanRel(p) {
  return String(p || '').replace(/\\/g, '/').split('/').filter((s) => s && s !== '.' && s !== '..').join('/');
}

const joinRemote = (base, rel) => [cleanRel(base), cleanRel(rel)].filter(Boolean).join('/');

// Gleiche Regeln wie normalizeUploadSegment in pages/api/files.js (dort nicht exportierbar).
export function safeSegment(input) {
  return String(input || '').normalize('NFC')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

/** PROPFIND-Antwort (Depth 1) -> [{ name, isDir, size }], ohne den Ordner selbst. */
export function parsePropfind(xml) {
  const items = [];
  const blocks = String(xml).split(/<(?:\w+:)?response[\s>]/i).slice(1);
  blocks.forEach((b, i) => {
    if (i === 0) return; // erster Eintrag = der angefragte Ordner
    const href = (b.match(/<(?:\w+:)?href>([^<]+)</i) || [])[1];
    if (!href) return;
    const isDir = /<(?:\w+:)?collection\s*\/?>/i.test(b);
    const name = decodeURIComponent(href.replace(/\/+$/, '').split('/').pop());
    const size = Number((b.match(/<(?:\w+:)?getcontentlength>(\d+)</i) || [])[1] || 0);
    items.push({ name, isDir, size });
  });
  return items;
}

// ── Treiber: { list(rel) -> [{name,isDir,size}], download(rel, destPath), close() } ──

async function sftpDriver(c) {
  const { default: SftpClient } = await import('ssh2-sftp-client');
  const client = new SftpClient();
  await client.connect({
    host: c.host, port: Number(c.port) || 22, username: c.username,
    password: c.password || undefined, privateKey: c.privateKey || undefined, readyTimeout: TIMEOUT_MS,
  });
  const abs = (rel) => '/' + joinRemote(c.basePath, rel);
  return {
    list: async (rel) => (await client.list(abs(rel)))
      .filter((e) => e.type === 'd' || e.type === '-')
      .map((e) => ({ name: e.name, isDir: e.type === 'd', size: e.size })),
    download: (rel, dest) => client.get(abs(rel), fs.createWriteStream(dest)),
    close: () => client.end(),
  };
}

function nextcloudDriver(c) {
  const root = `${String(c.url).replace(/\/+$/, '')}/remote.php/dav/files/${encodeURIComponent(c.username)}`;
  const headers = { Authorization: 'Basic ' + Buffer.from(`${c.username}:${c.password}`).toString('base64') };
  const url = (rel) => `${root}/${joinRemote(c.basePath, rel).split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
  const req = async (u, init) => {
    const res = await fetch(u, { ...init, headers: { ...headers, ...init?.headers }, signal: AbortSignal.timeout(TIMEOUT_MS * 4) });
    if (res.status === 401) throw new Error('Nextcloud: Zugangsdaten abgelehnt (App-Passwort verwenden)');
    if (!res.ok) throw new Error(`Nextcloud: HTTP ${res.status}`);
    return res;
  };
  return {
    list: async (rel) => parsePropfind(await (await req(url(rel), { method: 'PROPFIND', headers: { Depth: '1' } })).text()),
    download: async (rel, dest) => {
      const res = await req(url(rel));
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
    },
    close: async () => {},
  };
}

async function s3Driver(c) {
  const { S3Client, ListObjectsV2Command, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: c.region || 'us-east-1',
    endpoint: c.endpoint || undefined,
    forcePathStyle: !!c.endpoint, // S3-kompatible Anbieter (MinIO, Hetzner, ...) brauchen Path-Style
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
  const key = (rel) => joinRemote(c.basePath, rel);
  return {
    list: async (rel) => {
      const prefix = key(rel) ? key(rel) + '/' : '';
      const out = [];
      let token;
      do {
        const r = await client.send(new ListObjectsV2Command({ Bucket: c.bucket, Prefix: prefix, Delimiter: '/', ContinuationToken: token }));
        (r.CommonPrefixes || []).forEach((p) => out.push({ name: p.Prefix.slice(prefix.length).replace(/\/$/, ''), isDir: true, size: 0 }));
        (r.Contents || []).filter((o) => o.Key !== prefix).forEach((o) => out.push({ name: o.Key.slice(prefix.length), isDir: false, size: o.Size }));
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      return out;
    },
    download: async (rel, dest) => {
      const r = await client.send(new GetObjectCommand({ Bucket: c.bucket, Key: key(rel) }));
      await pipeline(r.Body, fs.createWriteStream(dest));
    },
    close: async () => client.destroy(),
  };
}

export async function openDriver(source) {
  const c = source.config || {};
  if (source.type === 'sftp') return sftpDriver(c);
  if (source.type === 'nextcloud') return nextcloudDriver(c);
  if (source.type === 's3') return s3Driver(c);
  throw new Error('Unbekannter Quellentyp');
}

export async function withDriver(source, fn) {
  const driver = await openDriver(source);
  try { return await fn(driver); } finally { await driver.close().catch(() => {}); }
}

export async function listRemote(source, rel) {
  const items = await withDriver(source, (d) => d.list(cleanRel(rel)));
  return items.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name, 'de'));
}

function uniqueName(dir, name) {
  const { name: base, ext } = path.parse(name);
  let n = 1;
  let candidate = name;
  while (fs.existsSync(path.join(dir, candidate))) candidate = `${base}_${++n}${ext}`;
  return candidate;
}

/**
 * Importiert Dateien/Ordner nach public/uploads/<targetFolder>. Bestehende Dateien werden
 * nie überschrieben (Zähler-Suffix). items: [{ path, isDir }] relativ zur Quelle.
 */
export async function importFromSource(source, items, targetFolder) {
  const { resolved: targetRoot } = resolveSafeDir(targetFolder);
  const result = { imported: 0, skipped: [], errors: [] };

  await withDriver(source, async (driver) => {
    const copyFile = async (rel, localDir, size) => {
      if (result.imported >= MAX_FILES) { result.skipped.push(`${rel} (Limit ${MAX_FILES} Dateien)`); return; }
      if (size > MAX_FILE_BYTES) { result.skipped.push(`${rel} (größer als 200 MB)`); return; }
      fs.mkdirSync(localDir, { recursive: true });
      const dest = path.join(localDir, uniqueName(localDir, safeSegment(path.basename(rel)) || 'datei'));
      try {
        await driver.download(rel, dest);
        result.imported += 1;
      } catch (e) {
        fs.rmSync(dest, { force: true });
        result.errors.push(`${rel}: ${e.message}`);
      }
    };
    const copyDir = async (rel, localDir) => {
      for (const e of await driver.list(rel)) {
        const childRel = `${rel}/${e.name}`;
        if (e.isDir) await copyDir(childRel, path.join(localDir, safeSegment(e.name) || 'ordner'));
        else await copyFile(childRel, localDir, e.size);
      }
    };
    for (const it of items) {
      const rel = cleanRel(it.path);
      if (!rel) continue;
      if (it.isDir) await copyDir(rel, path.join(targetRoot, safeSegment(path.basename(rel)) || 'ordner'));
      else await copyFile(rel, targetRoot, Number(it.size) || 0);
    }
  });
  return result;
}
