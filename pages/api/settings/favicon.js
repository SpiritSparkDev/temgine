import fs from 'fs';
import path from 'path';
import formidable from 'formidable';
import sharp from 'sharp';
import { requireAuth } from '../../../lib/auth';

export const config = { api: { bodyParser: false } };

const DIR = path.join(process.cwd(), 'public', 'uploads', 'favicon');
const PNGS = { 'favicon-16x16.png': 16, 'favicon-32x32.png': 32, 'apple-touch-icon.png': 180 };

// ICO-Container mit eingebettetem 32x32-PNG (von allen modernen Browsern unterstützt)
function pngToIco(png) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2); // Typ: Icon
  head.writeUInt16LE(1, 4); // 1 Bild
  head[6] = 32; head[7] = 32;
  head.writeUInt16LE(1, 10); // Planes
  head.writeUInt16LE(32, 12); // Bits pro Pixel
  head.writeUInt32LE(png.length, 14);
  head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}

export default async function handler(req, res) {
  const auth = await requireAuth(req, res, ['ADMIN']);
  if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });

  if (req.method === 'DELETE') {
    fs.rmSync(DIR, { recursive: true, force: true });
    return res.status(200).json({ success: true });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });

  const form = formidable({ maxFileSize: 10 * 1024 * 1024, filter: ({ mimetype }) => !!mimetype && mimetype.startsWith('image/') });
  try {
    const [, files] = await form.parse(req);
    const file = (files.file || [])[0];
    if (!file) return res.status(400).json({ error: 'Keine Bilddatei übermittelt' });

    fs.mkdirSync(DIR, { recursive: true });
    // Quadratisch zuschneiden (zentriert), transparenter Hintergrund bleibt erhalten
    const square = (size) => sharp(file.filepath).resize(size, size, { fit: 'cover' }).png();
    for (const [name, size] of Object.entries(PNGS)) {
      await square(size).toFile(path.join(DIR, name));
    }
    fs.writeFileSync(path.join(DIR, 'favicon.ico'), pngToIco(fs.readFileSync(path.join(DIR, 'favicon-32x32.png'))));
    fs.rmSync(file.filepath, { force: true });
    return res.status(200).json({ success: true, version: Date.now() });
  } catch (e) {
    console.error('Favicon-Erzeugung fehlgeschlagen:', e);
    return res.status(500).json({ error: 'Bild konnte nicht verarbeitet werden' });
  }
}
