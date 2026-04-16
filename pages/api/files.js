import fs from 'fs';
import path from 'path';
import formidable from 'formidable';

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
function resolveSafeDir(folderParam) {
  const safe = (folderParam || '').replace(/\.\./g, '').replace(/^\/+/, '').replace(/\/+$/, '');
  const resolved = path.resolve(UPLOAD_DIR, safe);
  if (!resolved.startsWith(UPLOAD_DIR)) throw new Error('UngÃ¼ltiger Pfad');
  return { resolved, safe };
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
    // Datei hochladen â€” optional: ?folder=subfolder fÃ¼r Upload in Unterordner
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

    const form = formidable({
      uploadDir: targetUploadDir,
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      filename: (name, ext, part) => {
        // Bereinige Dateinamen
        const cleanName = part.originalFilename
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .toLowerCase();
        return `${Date.now()}_${cleanName}`;
      }
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        return res.status(500).json({ error: 'Upload fehlgeschlagen' });
      }

      const file = files.file;
      if (!file) {
        return res.status(400).json({ error: 'Keine Datei gefunden' });
      }

      const uploadedFile = Array.isArray(file) ? file[0] : file;
      const relPath = path.relative(path.join(process.cwd(), 'public'), uploadedFile.filepath)
        .replace(/\\/g, '/');

      res.status(200).json({
        success: true,
        file: {
          name: path.basename(uploadedFile.filepath),
          size: uploadedFile.size,
          type: uploadedFile.mimetype,
          url: `/${relPath}`
        }
      });
    });
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
