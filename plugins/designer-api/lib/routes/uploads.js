import crypto from 'crypto';
import {
  MAX_CHUNK, cleanFileName, cleanFolder, sniff, createSession, getSession, dropSession,
  partCount, expectedPartSize, MAX_SESSIONS,
} from '../uploads';

// Gestückelter Upload (WP-B2). Ablauf: POST uploads (Plan prüfen) -> PUT uploads/:id/:index (Teile als base64, je ≤ 700 KB,
// wiederholbar) -> POST uploads/:id/complete (Zusammenbau, Inhaltsprüfung, Schreiben) | DELETE uploads/:id (Abbruch).
export const features = ['assets-upload'];

export const routes = ({ core, authed, audit }) => ({
  'GET v1/assets/folders': authed('filesView', (req, res) => res.status(200).json({ folders: core.uploads.listFolders() })),

  'POST v1/assets/uploads': authed('upload', (req, res, ctx, user) => {
    const b = req.body || {};
    const file = cleanFileName(b.name);
    if (file.error) return ctx.fail(415, file.error, 'UPLOAD_TYPE_NOT_ALLOWED', { path: 'name' });
    const size = b.size;
    if (!Number.isInteger(size) || size < 1) return ctx.fail(400, 'size muss eine positive ganze Zahl sein', 'VALIDATION_ERROR', { path: 'size' });
    if (size > core.uploads.maxFileSize) return ctx.fail(413, `Datei zu groß (maximal ${Math.round(core.uploads.maxFileSize / 1048576)} MB)`, 'FILE_TOO_LARGE', { path: 'size', maxFileSize: core.uploads.maxFileSize });
    const folder = cleanFolder(b.folder);
    if (folder.error) return ctx.fail(400, folder.error, 'VALIDATION_ERROR', { path: 'folder' });
    const s = createSession({ id: crypto.randomBytes(16).toString('hex'), user: user.sub, name: file.name, ext: file.ext, folder: folder.folder, size }, core.now());
    if (!s) return ctx.fail(429, `Zu viele gleichzeitige Uploads (höchstens ${MAX_SESSIONS})`, 'UPLOAD_BUSY');
    return res.status(201).json({ uploadId: s.id, chunkSize: s.chunkSize, parts: partCount(s), name: s.name, folder: s.folder });
  }),

  'GET v1/assets/uploads/:id': authed('upload', (req, res, ctx, user) => {
    const s = getSession(ctx.params.id, user.sub, core.now());
    if (!s) return ctx.fail(404, 'Upload nicht gefunden oder abgelaufen', 'UPLOAD_NOT_FOUND');
    return res.status(200).json({ uploadId: s.id, size: s.size, chunkSize: s.chunkSize, parts: partCount(s), received: [...s.parts.keys()].sort((a, c) => a - c) });
  }),

  'PUT v1/assets/uploads/:id/:index': authed('upload', (req, res, ctx, user) => {
    const s = getSession(ctx.params.id, user.sub, core.now());
    if (!s) return ctx.fail(404, 'Upload nicht gefunden oder abgelaufen', 'UPLOAD_NOT_FOUND');
    const i = Number(ctx.params.index);
    if (!Number.isInteger(i) || i < 0 || i >= partCount(s)) return ctx.fail(400, 'Ungültiger Teil-Index', 'VALIDATION_ERROR', { path: 'index' });
    const data = req.body?.data;
    if (typeof data !== 'string' || data.length > Math.ceil(MAX_CHUNK / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return ctx.fail(400, 'data muss base64 sein (Teil höchstens 700 KB)', 'VALIDATION_ERROR', { path: 'data' });
    const buf = Buffer.from(data, 'base64');
    if (buf.length !== expectedPartSize(s, i)) return ctx.fail(400, `Teil ${i} hat ${buf.length} statt ${expectedPartSize(s, i)} Byte`, 'CHUNK_SIZE_MISMATCH', { path: 'data' });
    s.parts.set(i, buf);
    return res.status(200).json({ index: i, received: s.parts.size, parts: partCount(s) });
  }),

  'POST v1/assets/uploads/:id/complete': authed('upload', async (req, res, ctx, user) => {
    const s = getSession(ctx.params.id, user.sub, core.now());
    if (!s) return ctx.fail(404, 'Upload nicht gefunden oder abgelaufen', 'UPLOAD_NOT_FOUND');
    const missing = Array.from({ length: partCount(s) }, (_, i) => i).filter((i) => !s.parts.has(i));
    if (missing.length) return ctx.fail(409, `Es fehlen Teile: ${missing.slice(0, 10).join(', ')}`, 'UPLOAD_INCOMPLETE', { missing });
    const buf = Buffer.concat([...s.parts.entries()].sort((a, c) => a[0] - c[0]).map(([, p]) => p));
    dropSession(s.id); // ab hier ist der Upload entschieden (Erfolg oder Ablehnung), nichts bleibt liegen
    if (buf.length !== s.size) return ctx.fail(400, 'Größe stimmt nicht mit der Ankündigung überein', 'CHUNK_SIZE_MISMATCH');
    const bad = sniff(buf, s.ext);
    if (bad) return ctx.fail(415, bad, 'UPLOAD_CONTENT_REJECTED');
    const saved = await core.uploads.commit(s.folder, s.name, buf);
    await audit(user, 'asset.upload', saved.path, { name: saved.name, size: buf.length });
    return res.status(201).json({ path: saved.path, url: saved.url, name: saved.name, size: buf.length });
  }),

  'DELETE v1/assets/uploads/:id': authed('upload', (req, res, ctx, user) => {
    const s = getSession(ctx.params.id, user.sub, core.now());
    if (s) dropSession(s.id);
    return res.status(200).json({ aborted: !!s });
  }),
});
