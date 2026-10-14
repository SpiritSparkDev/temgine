import fs from 'fs'
import formidable from 'formidable'
import { prisma } from '../../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../../lib/auth'
import { logAudit } from '../../../../../lib/audit'
import { requireShopEnabled } from '../../../../../lib/shop/guard'
import { ensureDownloadDir, makeStoredName, sanitizeFilename, resolveStoredPath, removeStoredFile, MAX_FILE_BYTES } from '../../../../../lib/shop/downloads'

export const config = { api: { bodyParser: false } }

const fail = (res, status, error, code) => res.status(status).json({ error, code })

/** Liste (GET) und Upload (POST, multipart, eine Datei) der Download-Dateien eines digitalen Formats. */
export default async function handler(req, res) {
  try {
    const isGet = req.method === 'GET'
    const auth = await requireAuth(req, res, isGet ? PERMISSIONS.SHOP_PRODUCTS_VIEW : PERMISSIONS.SHOP_PRODUCTS_EDIT)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return
    if (!isGet && req.method !== 'POST') return fail(res, 405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED')

    const { formatId } = req.query
    const format = await prisma.shopFormat.findUnique({ where: { id: formatId } })
    if (!format) return fail(res, 404, 'Format nicht gefunden', 'NOT_FOUND')

    if (isGet) {
      const rows = await prisma.shopDigitalFile.findMany({
        where: { formatId },
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { tokens: true } } },
      })
      return res.status(200).json({
        files: rows.map((f) => ({ id: f.id, filename: f.filename, sizeBytes: f.sizeBytes, createdAt: f.createdAt, tokenCount: f._count.tokens })),
      })
    }

    if (!format.digital) return fail(res, 422, 'Dateien können nur digitalen Formaten zugeordnet werden', 'VALIDATION_ERROR')

    const dir = ensureDownloadDir()
    const form = formidable({
      uploadDir: dir,
      multiples: false,
      maxFiles: 1,
      maxFileSize: MAX_FILE_BYTES,
      filename: (_name, _ext, part) => makeStoredName(part.originalFilename),
    })
    let files
    try {
      files = await new Promise((resolve, reject) => form.parse(req, (err, _f, fl) => (err ? reject(err) : resolve(fl))))
    } catch (e) {
      if (e && (e.httpCode === 413 || /maxFileSize/i.test(e.message || ''))) return fail(res, 413, 'Datei zu groß (max. 200 MB)', 'FILE_TOO_LARGE')
      console.error('[shop/files] Upload fehlgeschlagen:', e && e.message)
      return fail(res, 400, 'Upload fehlgeschlagen', 'UPLOAD_FAILED')
    }
    const list = Object.values(files || {}).flat().filter(Boolean)
    if (list.length !== 1) {
      await Promise.all(list.map((f) => removeStoredFile(f.newFilename)))
      return fail(res, 400, 'Genau eine Datei erwartet', 'VALIDATION_ERROR')
    }
    const up = list[0]
    const storedName = up.newFilename
    if (!resolveStoredPath(storedName)) {
      try { fs.unlinkSync(up.filepath) } catch (_e) { /* ignorieren */ }
      return fail(res, 400, 'Upload fehlgeschlagen', 'UPLOAD_FAILED')
    }

    let row
    try {
      row = await prisma.shopDigitalFile.create({
        data: {
          formatId,
          filename: sanitizeFilename(up.originalFilename),
          storedName,
          sizeBytes: up.size,
          mime: up.mimetype ? String(up.mimetype).slice(0, 100) : null,
        },
      })
    } catch (e) {
      await removeStoredFile(storedName)
      throw e
    }
    await logAudit({ action: 'shop.file.upload', resource: 'shop-format', resourceId: formatId, userId: auth.user.id, details: { fileId: row.id, filename: row.filename, sizeBytes: row.sizeBytes } })
    return res.status(201).json({ file: { id: row.id, filename: row.filename, sizeBytes: row.sizeBytes, createdAt: row.createdAt, tokenCount: 0 } })
  } catch (e) {
    console.error('[/api/shop/formats/[formatId]/files Error]', e.message)
    return fail(res, 500, 'Interner Serverfehler', 'INTERNAL_ERROR')
  }
}
