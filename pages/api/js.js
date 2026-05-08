import fs from 'fs';
import path from 'path';
import formidable from 'formidable';
import { requireAuth } from '../../lib/auth';

export const config = {
  api: {
    bodyParser: false,
  },
};

const JS_DIR = path.join(process.cwd(), 'public', 'extern_js');
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
const ORDER_FILE = path.join(JS_DIR, '.order.json');
const CONFIG_FILE = path.join(process.cwd(), 'data', 'js-config.json');

if (!fs.existsSync(JS_DIR)) {
  fs.mkdirSync(JS_DIR, { recursive: true });
}

function loadDisabledSet() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return new Set(Array.isArray(data.disabled) ? data.disabled : []);
    }
  } catch (e) {}
  return new Set();
}

function resolveSafePath(baseDir, fileName) {
  const target = path.resolve(baseDir, fileName || '');
  const base = path.resolve(baseDir) + path.sep;
  if (!target.startsWith(base)) return null;
  return target;
}

function scanUploadsForJs(dir, relBase, results = []) {
  if (!fs.existsSync(dir)) return results;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryRel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        scanUploadsForJs(path.join(dir, entry.name), entryRel, results);
      } else if (entry.name.toLowerCase().endsWith('.js')) {
        const id = `uploads/${entryRel}`;
        const absPath = path.join(dir, entry.name);
        if (!absPath.startsWith(UPLOADS_DIR)) continue;
        results.push({ id, name: entry.name, source: 'uploads', href: `/uploads/${entryRel}` });
      }
    }
  } catch (e) {}
  return results;
}

function buildOrderedExternFiles(disabled) {
  let fileNames = fs.existsSync(JS_DIR)
    ? fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js'))
    : [];

  if (fs.existsSync(ORDER_FILE)) {
    try {
      const orderData = JSON.parse(fs.readFileSync(ORDER_FILE, 'utf-8'));
      const order = Array.isArray(orderData.order) ? orderData.order : [];
      const ordered = [];
      order.forEach(file => {
        if (fileNames.includes(file)) ordered.push(file);
      });
      fileNames.forEach(file => {
        if (!ordered.includes(file)) ordered.push(file);
      });
      fileNames = ordered;
    } catch (e) {
      fileNames.sort();
    }
  } else {
    fileNames.sort();
  }

  return fileNames.map(name => ({
    id: `extern_js/${name}`,
    name,
    source: 'extern_js',
    href: `/extern_js/${name}`,
    enabled: !disabled.has(`extern_js/${name}`),
  }));
}

export default async function handler(req, res) {
  const contentType = (req.headers['content-type'] || '').toLowerCase();

  const readRawBody = () => new Promise((resolve, reject) => {
    try {
      let data = '';
      req.on('data', chunk => (data += chunk));
      req.on('end', () => resolve(data));
      req.on('error', err => reject(err));
    } catch (e) {
      reject(e);
    }
  });

  const isWriteMethod = req.method === 'POST' || req.method === 'DELETE';
  if (isWriteMethod || req.query?.file) {
    const auth = await requireAuth(req, res, ['ADMIN', 'MODERATOR']);
    if (!auth.authorized) {
      return res.status(auth.status || 401).json({ error: auth.error });
    }
  }

  if (req.method === 'POST' && contentType.includes('multipart/form-data')) {
    const form = formidable({ multiples: false });
    form.parse(req, (err, fields, files) => {
      if (err) {
        return res.status(500).json({ error: 'Fehler beim Parsen der Datei' });
      }
      try {
        const uploaded = files && files.file;
        if (!uploaded) return res.status(400).json({ error: 'Keine Datei empfangen' });

        const fileObj = Array.isArray(uploaded) ? uploaded[0] : uploaded;
        const originalName = fileObj.originalFilename || fileObj.name || 'upload.js';
        if (!originalName.toLowerCase().endsWith('.js')) {
          return res.status(400).json({ error: 'Nur .js Dateien sind erlaubt' });
        }

        const safeName = path.basename(originalName);
        const destPath = resolveSafePath(JS_DIR, safeName);
        if (!destPath) return res.status(400).json({ error: 'Ungültiger Dateipfad' });

        const data = fs.readFileSync(fileObj.filepath || fileObj.path);
        fs.writeFileSync(destPath, data);

        return res.status(200).json({ success: true, file: safeName });
      } catch (e) {
        return res.status(500).json({ error: 'Fehler beim Speichern der hochgeladenen Datei' });
      }
    });
    return;
  }

  let parsedBody = null;
  if (isWriteMethod) {
    try {
      if (contentType.includes('application/json')) {
        const raw = await readRawBody();
        parsedBody = raw ? JSON.parse(raw) : {};
      }
    } catch (e) {
      parsedBody = null;
    }
  }

  if (req.method === 'GET') {
    const { file } = req.query;

    if (file) {
      try {
        const filePath = resolveSafePath(JS_DIR, file);
        if (!filePath || !filePath.endsWith('.js')) {
          return res.status(400).json({ error: 'Ungültiger Dateipfad' });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        return res.status(200).json({ content });
      } catch (error) {
        return res.status(500).json({ error: 'Fehler beim Laden der Datei' });
      }
    }

    try {
      const disabled = loadDisabledSet();
      const externFiles = buildOrderedExternFiles(disabled);
      const uploadFiles = scanUploadsForJs(UPLOADS_DIR, '', []).map(f => ({
        ...f,
        enabled: !disabled.has(f.id),
      }));

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ files: [...externFiles, ...uploadFiles] });
    } catch (error) {
      return res.status(500).json({ error: 'Fehler beim Laden der Dateiliste' });
    }
  }

  if (req.method === 'POST') {
    const payload = parsedBody || {};

    if (!payload.filename && Array.isArray(payload.disabled)) {
      try {
        const dataDir = path.dirname(CONFIG_FILE);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({ disabled: payload.disabled }, null, 2), 'utf-8');
        return res.status(200).json({ success: true });
      } catch (error) {
        return res.status(500).json({ error: 'Fehler beim Speichern der Konfiguration' });
      }
    }

    try {
      const { filename, content } = payload;
      if (!filename || !String(filename).toLowerCase().endsWith('.js')) {
        return res.status(400).json({ error: 'Dateiname muss mit .js enden' });
      }

      const filePath = resolveSafePath(JS_DIR, path.basename(filename));
      if (!filePath) return res.status(400).json({ error: 'Ungültiger Dateipfad' });

      fs.writeFileSync(filePath, content || '', 'utf-8');
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Fehler beim Speichern der Datei' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { filename } = parsedBody || {};
      if (!filename) return res.status(400).json({ error: 'Dateiname erforderlich' });

      const filePath = resolveSafePath(JS_DIR, path.basename(filename));
      if (!filePath || !filePath.endsWith('.js')) {
        return res.status(400).json({ error: 'Ungültiger Dateipfad' });
      }

      fs.unlinkSync(filePath);
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Fehler beim Löschen der Datei' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
