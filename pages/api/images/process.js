import fs from 'fs';
import path from 'path';
import formidable from 'formidable';
import sharp from 'sharp';

export const config = {
  api: {
    bodyParser: false,
  },
};

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'images');
const THUMB_DIR = path.join(UPLOAD_DIR, 'thumbnails');
const SIZES = {
  thumbnail: { width: 150, height: 150 },
  small: { width: 400, height: null },
  medium: { width: 800, height: null },
  large: { width: 1200, height: null }
};

// Erstelle Verzeichnisse
[UPLOAD_DIR, THUMB_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

async function processImage(inputPath, filename) {
  const results = {};
  const ext = path.extname(filename);
  const basename = path.basename(filename, ext);

  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    // Original als WebP speichern
    const webpPath = path.join(UPLOAD_DIR, `${basename}.webp`);
    await image.webp({ quality: 85 }).toFile(webpPath);
    results.original = `/uploads/images/${basename}.webp`;

    // Verschiedene Größen generieren
    for (const [sizeName, dimensions] of Object.entries(SIZES)) {
      const outputPath = path.join(
        sizeName === 'thumbnail' ? THUMB_DIR : UPLOAD_DIR,
        `${basename}_${sizeName}.webp`
      );

      let resizeOptions = {};
      if (dimensions.width && dimensions.height) {
        resizeOptions = {
          width: dimensions.width,
          height: dimensions.height,
          fit: 'cover'
        };
      } else {
        resizeOptions = {
          width: dimensions.width,
          fit: 'inside'
        };
      }

      await sharp(inputPath)
        .resize(resizeOptions)
        .webp({ quality: 80 })
        .toFile(outputPath);

      results[sizeName] = sizeName === 'thumbnail'
        ? `/uploads/images/thumbnails/${basename}_${sizeName}.webp`
        : `/uploads/images/${basename}_${sizeName}.webp`;
    }

    return {
      success: true,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: metadata.size
      },
      urls: results
    };
  } catch (error) {
    console.error('Bildverarbeitung fehlgeschlagen:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Nur POST erlaubt' });
  }

  const form = formidable({
    uploadDir: UPLOAD_DIR,
    keepExtensions: true,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    filter: ({ mimetype }) => {
      return mimetype && mimetype.startsWith('image/');
    }
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({ error: 'Upload fehlgeschlagen' });
    }

    const file = files.file;
    if (!file) {
      return res.status(400).json({ error: 'Keine Bilddatei gefunden' });
    }

    const uploadedFile = Array.isArray(file) ? file[0] : file;

    try {
      const result = await processImage(
        uploadedFile.filepath,
        uploadedFile.originalFilename
      );

      // Lösche temporäre Upload-Datei
      fs.unlinkSync(uploadedFile.filepath);

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: 'Bildverarbeitung fehlgeschlagen' });
    }
  });
}
