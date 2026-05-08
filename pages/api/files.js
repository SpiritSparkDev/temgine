import fs from 'fs';
import path from 'path';
import formidable from 'formidable';
import { prisma } from '../../lib/prisma';
import { rateLimit } from '../../lib/rateLimit';

export const config = {
  api: {
    bodyParser: false,
  },
};

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

// Stelle sicher, dass Upload-Verzeichnis existiert
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Validates a folder param and returns an absolute path within UPLOAD_DIR
// Erlaubt auch größere Ordner-Uploads mit vielen Einzeldateien
const uploadLimiter = rateLimit({ windowMs: 60_000, max: 500 });

function resolveSafeDir(folderParam) {
  const safe = (folderParam || '').replace(/\.\./g, '').replace(/^\/+/, '').replace(/\/+$/, '');
  const resolved = path.resolve(UPLOAD_DIR, safe);
  if (!resolved.startsWith(UPLOAD_DIR)) throw new Error('UngÃ¼ltiger Pfad');
  return { resolved, safe };
}

function normalizeUploadSegment(input) {
  return String(input || '')
    .normalize('NFC')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function sanitizeRelativePath(relativePath) {
  const normalized = String(relativePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .filter((part) => part !== '.' && part !== '..')
    .map((part) => normalizeUploadSegment(part));

  if (normalized.length === 0) return { relativeDir: '', filename: '' };

  const filename = normalized[normalized.length - 1];
  const relativeDir = normalized.slice(0, -1).join('/');
  return { relativeDir, filename };
}

function getUniqueFilename(dir, preferredName, options = {}) {
  const { reservedNames = null, ignorePath = '' } = options;
  const parsed = path.parse(preferredName || 'upload');
  const baseName = parsed.name || 'upload';
  const extension = parsed.ext || '';
  const ignoredAbs = ignorePath ? path.resolve(ignorePath) : '';

  let counter = 1;
  let candidate = `${baseName}${extension}`;

  while (true) {
    const abs = path.join(dir, candidate);
    const existsOnDisk = fs.existsSync(abs) && path.resolve(abs) !== ignoredAbs;
    const existsInBatch = reservedNames ? reservedNames.has(candidate) : false;
    if (!existsOnDisk && !existsInBatch) {
      if (reservedNames) reservedNames.add(candidate);
      return candidate;
    }
    counter += 1;
    candidate = `${baseName}_${counter}${extension}`;
  }
}

function parseJsonBody(req) {
  return new Promise(async (resolve, reject) => {
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
      }
      resolve(body ? JSON.parse(body) : {});
    } catch (error) {
      reject(error);
    }
  });
}

function toUploadUrl(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  return `/uploads/${normalized}`;
}

function normalizeUploadFilename(input) {
  const parsed = path.parse(String(input || ''));
  const base = normalizeUploadSegment(parsed.name) || 'upload';
  const extension = normalizeUploadSegment(parsed.ext).replace(/_/g, '') || parsed.ext || '';
  return `${base}${extension}`;
}

function repairFilenamesRecursive(absDir, oldRelativeDir = '', newRelativeDir = '') {
  const result = {
    renamedFiles: 0,
    renamedFolders: 0,
    mappings: [],
  };

  const entries = fs.readdirSync(absDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'de', { sensitivity: 'base' }));

  for (const entry of entries) {
    const oldName = entry.name;
    const oldAbsPath = path.join(absDir, oldName);
    const oldRelativePath = [oldRelativeDir, oldName].filter(Boolean).join('/');

    if (entry.isDirectory()) {
      const preferredDirName = normalizeUploadSegment(oldName) || 'ordner';
      const nextDirName = getUniqueFilename(absDir, preferredDirName, { ignorePath: oldAbsPath });
      const nextAbsPath = path.join(absDir, nextDirName);
      const nextRelativePath = [newRelativeDir, nextDirName].filter(Boolean).join('/');

      if (nextDirName !== oldName) {
        fs.renameSync(oldAbsPath, nextAbsPath);
        result.renamedFolders += 1;
      }

      const childResult = repairFilenamesRecursive(nextAbsPath, oldRelativePath, nextRelativePath);
      result.renamedFiles += childResult.renamedFiles;
      result.renamedFolders += childResult.renamedFolders;
      result.mappings.push(...childResult.mappings);
      continue;
    }

    if (!entry.isFile()) continue;

    const preferredFileName = normalizeUploadFilename(oldName);
    const nextFileName = getUniqueFilename(absDir, preferredFileName, { ignorePath: oldAbsPath });
    const nextAbsPath = path.join(absDir, nextFileName);
    const nextRelativePath = [newRelativeDir, nextFileName].filter(Boolean).join('/');

    if (nextFileName !== oldName) {
      fs.renameSync(oldAbsPath, nextAbsPath);
      result.renamedFiles += 1;
    }

    if (oldRelativePath !== nextRelativePath) {
      result.mappings.push({
        oldUrl: toUploadUrl(oldRelativePath),
        newUrl: toUploadUrl(nextRelativePath),
      });
    }
  }

  return result;
}

async function syncMetadataUrls(mappings = []) {
  let updated = 0;
  const uniqueMappings = buildUniqueMappings(mappings);

  for (const { oldUrl, newUrl } of uniqueMappings) {
    const existing = await prisma.fileMetadata.findUnique({ where: { url: oldUrl } });
    if (!existing) continue;

    const target = await prisma.fileMetadata.findUnique({ where: { url: newUrl } });
    if (target) {
      await prisma.fileMetadata.update({
        where: { url: newUrl },
        data: {
          altText: target.altText || existing.altText,
          copyright: target.copyright || existing.copyright,
          caption: target.caption || existing.caption,
        },
      });
      await prisma.fileMetadata.delete({ where: { url: oldUrl } });
      updated += 1;
      continue;
    }

    await prisma.fileMetadata.update({
      where: { url: oldUrl },
      data: { url: newUrl },
    });
    updated += 1;
  }

  return updated;
}

function buildUniqueMappings(mappings = []) {
  const uniqueMappings = [];
  const seen = new Set();

  const add = (oldUrl, newUrl) => {
    if (!oldUrl || !newUrl || oldUrl === newUrl) return;
    const key = `${oldUrl}=>${newUrl}`;
    if (seen.has(key)) return;
    seen.add(key);
    uniqueMappings.push({ oldUrl, newUrl });
  };

  for (const item of mappings) {
    const oldUrl = String(item?.oldUrl || '');
    const newUrl = String(item?.newUrl || '');
    add(oldUrl, newUrl);

    try {
      add(encodeURI(oldUrl), encodeURI(newUrl));
    } catch (_e) {}
  }

  uniqueMappings.sort((left, right) => right.oldUrl.length - left.oldUrl.length);
  return uniqueMappings;
}

function replaceMappedUrlsInString(input, mappings = []) {
  let output = String(input || '');
  let replaced = 0;

  for (const { oldUrl, newUrl } of mappings) {
    if (!oldUrl || oldUrl === newUrl) continue;
    if (!output.includes(oldUrl)) continue;

    const parts = output.split(oldUrl);
    replaced += Math.max(parts.length - 1, 0);
    output = parts.join(newUrl);
  }

  return { output, replaced };
}

function resolveUploadUrlToAbsolute(uploadUrlPath) {
  const relative = String(uploadUrlPath || '').replace(/^\/uploads\//, '').replace(/^\/+/, '');
  const abs = path.resolve(UPLOAD_DIR, relative);
  if (!abs.startsWith(UPLOAD_DIR)) return null;
  return abs;
}

function findBestMatchForNormalizedFile(dirAbs, normalizedFilename) {
  if (!fs.existsSync(dirAbs)) return null;
  const parsed = path.parse(normalizedFilename);
  const targetBase = parsed.name || '';
  const targetExt = (parsed.ext || '').toLowerCase();

  const candidates = fs.readdirSync(dirAbs)
    .filter((entry) => {
      const entryParsed = path.parse(entry);
      if ((entryParsed.ext || '').toLowerCase() !== targetExt) return false;
      return entryParsed.name === targetBase || entryParsed.name.startsWith(`${targetBase}_`);
    })
    .sort((left, right) => {
      if (left.length !== right.length) return left.length - right.length;
      return left.localeCompare(right, 'de', { sensitivity: 'base' });
    });

  return candidates[0] || null;
}

function tryRepairSingleUploadUrl(rawUrl) {
  if (!rawUrl || !rawUrl.startsWith('/uploads/')) return rawUrl;

  const hashIndex = rawUrl.indexOf('#');
  const queryIndex = rawUrl.indexOf('?');
  const splitIndex = [queryIndex, hashIndex].filter((idx) => idx >= 0).sort((a, b) => a - b)[0] ?? -1;
  const pathPart = splitIndex >= 0 ? rawUrl.slice(0, splitIndex) : rawUrl;
  const suffix = splitIndex >= 0 ? rawUrl.slice(splitIndex) : '';

  const exactAbs = resolveUploadUrlToAbsolute(pathPart);
  if (exactAbs && fs.existsSync(exactAbs)) return rawUrl;

  let decodedPath = pathPart;
  try { decodedPath = decodeURI(pathPart); } catch (_e) {}

  const relative = decodedPath.replace(/^\/uploads\//, '').replace(/^\/+/, '');
  const parts = relative.split('/').filter(Boolean);
  if (parts.length === 0) return rawUrl;

  const normalizedParts = parts.map((part, index) => {
    if (index === parts.length - 1) return normalizeUploadFilename(part);
    return normalizeUploadSegment(part);
  });
  const normalizedRelative = normalizedParts.join('/');
  const normalizedUrl = `/uploads/${normalizedRelative}${suffix}`;
  const normalizedAbs = resolveUploadUrlToAbsolute(`/uploads/${normalizedRelative}`);
  if (normalizedAbs && fs.existsSync(normalizedAbs)) return normalizedUrl;

  const normalizedFile = normalizedParts[normalizedParts.length - 1];
  const normalizedDirRel = normalizedParts.slice(0, -1).join('/');
  const normalizedDirAbs = path.resolve(UPLOAD_DIR, normalizedDirRel || '.');
  const bestMatch = findBestMatchForNormalizedFile(normalizedDirAbs, normalizedFile);
  if (!bestMatch) return rawUrl;

  const repairedRel = [normalizedDirRel, bestMatch].filter(Boolean).join('/');
  return `/uploads/${repairedRel}${suffix}`;
}

function repairUploadUrlsInString(input, urlCache) {
  const source = String(input || '');
  let changed = 0;

  const output = source.replace(/\/uploads\/[^"'\s)<>]+/g, (urlCandidate) => {
    if (urlCache.has(urlCandidate)) {
      const cached = urlCache.get(urlCandidate);
      if (cached !== urlCandidate) changed += 1;
      return cached;
    }

    const repaired = tryRepairSingleUploadUrl(urlCandidate);
    urlCache.set(urlCandidate, repaired);
    if (repaired !== urlCandidate) changed += 1;
    return repaired;
  });

  return { output, replaced: changed };
}

function replaceUrlsInJsonValue(value, mappings, urlCache) {
  if (typeof value === 'string') {
    const mapped = replaceMappedUrlsInString(value, mappings);
    const repaired = repairUploadUrlsInString(mapped.output, urlCache);
    return {
      value: repaired.output,
      replaced: mapped.replaced + repaired.replaced,
      changed: repaired.output !== value,
    };
  }

  if (Array.isArray(value)) {
    let replaced = 0;
    let changed = false;
    const next = value.map((item) => {
      const result = replaceUrlsInJsonValue(item, mappings, urlCache);
      replaced += result.replaced;
      if (result.changed) changed = true;
      return result.value;
    });
    return { value: next, replaced, changed };
  }

  if (value && typeof value === 'object') {
    let replaced = 0;
    let changed = false;
    const next = {};
    for (const [key, item] of Object.entries(value)) {
      const result = replaceUrlsInJsonValue(item, mappings, urlCache);
      next[key] = result.value;
      replaced += result.replaced;
      if (result.changed) changed = true;
    }
    return { value: next, replaced, changed };
  }

  return { value, replaced: 0, changed: false };
}

async function syncContentUrlReferences(mappings = []) {
  const uniqueMappings = buildUniqueMappings(mappings);
  const urlCache = new Map();
  const stats = {
    pages: 0,
    templates: 0,
    snippets: 0,
    navigations: 0,
    contentEntries: 0,
    settings: 0,
    replacedUrls: 0,
  };

  const pages = await prisma.page.findMany({
    select: { id: true, blocks: true, data: true, children: true },
  });
  for (const pageRecord of pages) {
    const blocksResult = replaceUrlsInJsonValue(pageRecord.blocks, uniqueMappings, urlCache);
    const dataResult = replaceUrlsInJsonValue(pageRecord.data, uniqueMappings, urlCache);
    const childrenResult = replaceUrlsInJsonValue(pageRecord.children, uniqueMappings, urlCache);
    const totalReplaced = blocksResult.replaced + dataResult.replaced + childrenResult.replaced;

    if (!blocksResult.changed && !dataResult.changed && !childrenResult.changed) continue;
    await prisma.page.update({
      where: { id: pageRecord.id },
      data: {
        blocks: blocksResult.value,
        data: dataResult.value,
        children: childrenResult.value,
      },
    });
    stats.pages += 1;
    stats.replacedUrls += totalReplaced;
  }

  const templates = await prisma.template.findMany({ select: { id: true, code: true } });
  for (const templateRecord of templates) {
    const mapped = replaceMappedUrlsInString(templateRecord.code, uniqueMappings);
    const repaired = repairUploadUrlsInString(mapped.output, urlCache);
    if (repaired.output === templateRecord.code) continue;
    await prisma.template.update({ where: { id: templateRecord.id }, data: { code: repaired.output } });
    stats.templates += 1;
    stats.replacedUrls += mapped.replaced + repaired.replaced;
  }

  const snippets = await prisma.snippet.findMany({ select: { id: true, value: true } });
  for (const snippetRecord of snippets) {
    const mapped = replaceMappedUrlsInString(snippetRecord.value, uniqueMappings);
    const repaired = repairUploadUrlsInString(mapped.output, urlCache);
    if (repaired.output === snippetRecord.value) continue;
    await prisma.snippet.update({ where: { id: snippetRecord.id }, data: { value: repaired.output } });
    stats.snippets += 1;
    stats.replacedUrls += mapped.replaced + repaired.replaced;
  }

  const navigations = await prisma.navigation.findMany({ select: { id: true, code: true } });
  for (const navRecord of navigations) {
    const mapped = replaceMappedUrlsInString(navRecord.code, uniqueMappings);
    const repaired = repairUploadUrlsInString(mapped.output, urlCache);
    if (repaired.output === navRecord.code) continue;
    await prisma.navigation.update({ where: { id: navRecord.id }, data: { code: repaired.output } });
    stats.navigations += 1;
    stats.replacedUrls += mapped.replaced + repaired.replaced;
  }

  const entries = await prisma.contentEntry.findMany({ select: { id: true, data: true } });
  for (const entryRecord of entries) {
    const result = replaceUrlsInJsonValue(entryRecord.data, uniqueMappings, urlCache);
    if (!result.changed) continue;
    await prisma.contentEntry.update({ where: { id: entryRecord.id }, data: { data: result.value } });
    stats.contentEntries += 1;
    stats.replacedUrls += result.replaced;
  }

  const settings = await prisma.setting.findMany({ select: { id: true, value: true } });
  for (const settingRecord of settings) {
    const mapped = replaceMappedUrlsInString(settingRecord.value, uniqueMappings);
    const repaired = repairUploadUrlsInString(mapped.output, urlCache);
    if (repaired.output === settingRecord.value) continue;
    await prisma.setting.update({ where: { id: settingRecord.id }, data: { value: repaired.output } });
    stats.settings += 1;
    stats.replacedUrls += mapped.replaced + repaired.replaced;
  }

  return stats;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { folder } = req.query || {};

    // Folder-aware listing (when ?folder= param is provided)
    if (folder !== undefined) {
      try {
        const { resolved: targetDir, safe: folderPath } = resolveSafeDir(folder);
        const fileList = [];
        const folderList = [];

        if (fs.existsSync(targetDir)) {
          const items = fs.readdirSync(targetDir);
          items.forEach(item => {
            const itemPath = path.join(targetDir, item);
            const stat = fs.statSync(itemPath);
            if (stat.isDirectory()) {
              folderList.push({ name: item, isFolder: true, modified: stat.mtime });
            } else {
              const urlPath = folderPath ? `${folderPath}/${item}` : item;
              fileList.push({
                name: item,
                size: stat.size,
                modified: stat.mtime,
                type: path.extname(item).toLowerCase(),
                url: `/uploads/${urlPath}`
              });
            }
          });
        }

        return res.status(200).json({ files: fileList, folders: folderList });
      } catch (error) {
        return res.status(500).json({ error: 'Fehler beim Laden: ' + error.message });
      }
    }

    // Legacy flat listing (no ?folder= param â€” backward compat for file picker modal)
    try {
      const fileList = [];

      const SIZE_VARIANTS = ['_thumbnail', '_small', '_medium', '_large'];

      function walkDir(dir) {
        if (!fs.existsSync(dir)) return;
        fs.readdirSync(dir).forEach(item => {
          const abs = path.join(dir, item);
          const stat = fs.statSync(abs);
          if (stat.isDirectory()) {
            walkDir(abs);
          } else {
            if (SIZE_VARIANTS.some(v => item.includes(v))) return;
            const rel = path.relative(UPLOAD_DIR, abs).replace(/\\/g, '/');
            fileList.push({
              name: item,
              filename: rel,
              size: stat.size,
              modified: stat.mtime,
              type: path.extname(item).toLowerCase(),
              url: `/uploads/${rel}`
            });
          }
        });
      }

      walkDir(UPLOAD_DIR);
      res.status(200).json({ files: fileList });
    } catch (error) {
      console.error('List files error:', error);
      res.status(500).json({ error: 'Fehler beim Laden der Dateien' });
    }
  } else if (req.method === 'POST') {
    // Rate-Limit für Uploads
    const { ok: rlOk, retryAfter } = uploadLimiter.check(req);
    if (!rlOk) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Zu viele Anfragen', code: 'RATE_LIMIT_EXCEEDED', retryAfter });
    }

    // Datei hochladen – optional: ?folder=subfolder für Upload in Unterordner
    const { folder: uploadFolder } = req.query || {};
    let targetUploadDir = UPLOAD_DIR;

    if (uploadFolder !== undefined) {
      try {
        const { resolved } = resolveSafeDir(uploadFolder);
        targetUploadDir = resolved;
        if (!fs.existsSync(targetUploadDir)) {
          fs.mkdirSync(targetUploadDir, { recursive: true });
        }
      } catch (e) {
        return res.status(400).json({ error: 'UngÃ¼ltiger Ordner' });
      }
    }

    const reservedRootNames = new Set();
    const form = formidable({
      uploadDir: targetUploadDir,
      multiples: true,
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      filename: (name, ext, part) => {
        const originalName = part.originalFilename || 'upload';
        const parsed = path.parse(originalName);
        const base = normalizeUploadSegment(parsed.name) || 'upload';
        const extension = normalizeUploadSegment(parsed.ext).replace(/_/g, '') || ext || '';
        return getUniqueFilename(targetUploadDir, `${base}${extension}`, { reservedNames: reservedRootNames });
      }
    });

    let fields
    let files
    try {
      const parsed = await new Promise((resolve, reject) => {
        form.parse(req, (err, nextFields, nextFiles) => {
          if (err) {
            reject(err)
          } else {
            resolve({ fields: nextFields, files: nextFiles })
          }
        })
      })
      fields = parsed.fields
      files = parsed.files
    } catch (_e) {
      return res.status(500).json({ error: 'Upload fehlgeschlagen' })
    }

    const file = files.file;
    if (!file) {
      return res.status(400).json({ error: 'Keine Datei gefunden' });
    }

    const uploadedFiles = Array.isArray(file) ? file : [file];
    const relativePaths = Array.isArray(fields.relativePath)
      ? fields.relativePath
      : (fields.relativePath ? [fields.relativePath] : []);

    try {
      const responseFiles = uploadedFiles.map((uploadedFile, index) => {
        const relativePathField = relativePaths[index];

        if (relativePathField) {
          const { relativeDir, filename } = sanitizeRelativePath(relativePathField);
          const nestedTargetDir = relativeDir ? path.join(targetUploadDir, relativeDir) : targetUploadDir;
          if (!nestedTargetDir.startsWith(UPLOAD_DIR)) {
            throw new Error('UngÃ¼ltiger relativer Pfad');
          }
          fs.mkdirSync(nestedTargetDir, { recursive: true });

          const finalName = getUniqueFilename(
            nestedTargetDir,
            filename || path.basename(uploadedFile.filepath),
            { ignorePath: uploadedFile.filepath }
          );
          const finalPath = path.join(nestedTargetDir, finalName);
          fs.renameSync(uploadedFile.filepath, finalPath);
          uploadedFile.filepath = finalPath;
        }

        const relPath = path.relative(path.join(process.cwd(), 'public'), uploadedFile.filepath)
          .replace(/\\/g, '/');

        return {
          name: path.basename(uploadedFile.filepath),
          size: uploadedFile.size,
          type: uploadedFile.mimetype,
          url: `/${relPath}`
        };
      });

      return res.status(200).json({
        success: true,
        files: responseFiles,
        file: responseFiles[0] || null,
      });
    } catch (_e) {
      return res.status(400).json({ error: 'Ordnerpfad konnte nicht verarbeitet werden' });
    }
  } else if (req.method === 'PATCH') {
    try {
      const body = await parseJsonBody(req);
      if (body?.action !== 'repair-filenames') {
        return res.status(400).json({ error: 'Ungültige Aktion' });
      }

      const { resolved: targetDir, safe: folderPath } = resolveSafeDir(body.folder || '');
      if (!fs.existsSync(targetDir)) {
        return res.status(404).json({ error: 'Ordner nicht gefunden' });
      }

      const result = repairFilenamesRecursive(targetDir, folderPath, folderPath);
      const metadataUpdated = await syncMetadataUrls(result.mappings);
      const referencesUpdated = await syncContentUrlReferences(result.mappings);

      return res.status(200).json({
        success: true,
        renamedFiles: result.renamedFiles,
        renamedFolders: result.renamedFolders,
        metadataUpdated,
        referencesUpdated,
      });
    } catch (error) {
      return res.status(500).json({ error: 'Dateinamen konnten nicht repariert werden: ' + error.message });
    }
  } else if (req.method === 'PUT') {
    // Ordner erstellen
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
      }
      const { folderName, parentFolder } = JSON.parse(body);

      if (!folderName || typeof folderName !== 'string') {
        return res.status(400).json({ error: 'Ordnername erforderlich' });
      }
      // Keine Pfad-Trennzeichen oder Sonderzeichen im Ordnernamen
      if (/[<>:"/\\|?*\x00-\x1f]/.test(folderName) || folderName === '.' || folderName === '..') {
        return res.status(400).json({ error: 'UngÃ¼ltiger Ordnername' });
      }

      const { resolved: parentPath } = resolveSafeDir(parentFolder || '');
      const newFolderPath = path.join(parentPath, folderName);

      if (!newFolderPath.startsWith(UPLOAD_DIR)) {
        return res.status(400).json({ error: 'UngÃ¼ltiger Pfad' });
      }

      if (fs.existsSync(newFolderPath)) {
        return res.status(409).json({ error: 'Ordner existiert bereits' });
      }

      fs.mkdirSync(newFolderPath, { recursive: true });
      res.status(200).json({ success: true, folderName });
    } catch (error) {
      res.status(500).json({ error: 'Fehler beim Erstellen des Ordners: ' + error.message });
    }
  } else if (req.method === 'DELETE') {
    // Datei oder Ordner löschen
    try {
      // Parse JSON body manuell, da bodyParser deaktiviert ist
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
      }
      const { filename, folderPath } = JSON.parse(body);

      // Ordner löschen
      if (folderPath !== undefined) {
        const { resolved: folderAbs } = resolveSafeDir(folderPath);
        if (!folderAbs.startsWith(UPLOAD_DIR)) {
          return res.status(400).json({ error: 'Ungültiger Pfad' });
        }
        if (!fs.existsSync(folderAbs)) {
          return res.status(404).json({ error: 'Ordner nicht gefunden' });
        }
        fs.rmSync(folderAbs, { recursive: true, force: true });
        return res.status(200).json({ success: true });
      }

      if (!filename) {
        return res.status(400).json({ error: 'Dateiname oder Ordnerpfad erforderlich' });
      }

      // Bestimme den richtigen Pfad (normales uploads/ oder uploads/images/)
      let filePath;
      let cleanFilename;

      if (filename.includes('/images/')) {
        // Bild aus images-Verzeichnis
        cleanFilename = filename.replace(/^\/uploads\/images\//, '').replace(/^uploads\/images\//, '');
        filePath = path.join(process.cwd(), 'public', 'uploads', 'images', cleanFilename);
      } else {
        // Normale Datei aus uploads/
        cleanFilename = filename.replace(/^\/uploads\//, '').replace(/^uploads\//, '');
        filePath = path.join(UPLOAD_DIR, cleanFilename);
      }

      // Path-Traversal-Schutz
      if (!filePath.startsWith(UPLOAD_DIR)) {
        return res.status(400).json({ error: 'UngÃ¼ltiger Pfad' });
      }

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);

        // Wenn es ein Bild ist, lÃ¶sche auch die optimierten Versionen
        const ext = path.extname(cleanFilename).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
          const basename = path.basename(cleanFilename, ext);
          const imageDir = path.join(process.cwd(), 'public', 'uploads', 'images');
          const thumbDir = path.join(imageDir, 'thumbnails');

          // LÃ¶sche alle GrÃ¶ÃŸen
          const sizes = ['', '_thumbnail', '_small', '_medium', '_large'];
          sizes.forEach(suffix => {
            const imagePath = path.join(imageDir, `${basename}${suffix}.webp`);
            if (fs.existsSync(imagePath)) {
              fs.unlinkSync(imagePath);
            }
            const thumbPath = path.join(thumbDir, `${basename}${suffix}.webp`);
            if (fs.existsSync(thumbPath)) {
              fs.unlinkSync(thumbPath);
            }
          });
        }

        res.status(200).json({ success: true, message: 'Datei gelÃ¶scht' });
      } else {
        res.status(404).json({ error: 'Datei nicht gefunden: ' + cleanFilename });
      }
    } catch (error) {
      console.error('Delete error:', error);
      res.status(500).json({ error: 'Fehler beim LÃ¶schen: ' + error.message });
    }
  } else {
    res.status(405).json({ error: 'Methode nicht erlaubt' });
  }
}
      const imageDir = path.join(process.cwd(), 'public', 'uploads', 'images');
