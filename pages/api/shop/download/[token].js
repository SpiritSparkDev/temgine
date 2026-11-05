import fs from 'fs'
import { prisma } from '../../../../lib/prisma'
import { rateLimit } from '../../../../lib/rateLimit'
import { clientIp } from '../../../../lib/shop/clientIp'
import { isShopEnabled } from '../../../../lib/shop/config'
import { resolveStoredPath } from '../../../../lib/shop/downloads'

const limiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyFn: (req) => `shop-download:${clientIp(req)}`,
})

const err = (res, status, error, code) => res.status(status).json({ error, code })

/** Öffentlicher Download per Token: Zähler wird atomar vor dem Streamen erhöht. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'GET') return err(res, 405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED')
    if (!(await isShopEnabled())) return err(res, 404, 'Nicht gefunden', 'NOT_FOUND')
    const rl = limiter.check(req)
    if (!rl.ok) {
      res.setHeader('Retry-After', String(rl.retryAfter || 60))
      return err(res, 429, 'Zu viele Anfragen. Bitte später erneut versuchen.', 'RATE_LIMIT_EXCEEDED')
    }

    const token = String(req.query.token || '')
    if (!/^[a-f0-9]{16,128}$/.test(token)) return err(res, 404, 'Download nicht gefunden', 'NOT_FOUND')
    const row = await prisma.shopDownloadToken.findUnique({ where: { token }, include: { file: true, order: true } })
    if (!row) return err(res, 404, 'Download nicht gefunden', 'NOT_FOUND')

    const now = new Date()
    if (row.expiresAt <= now) return err(res, 410, 'Dieser Download-Link ist abgelaufen', 'DOWNLOAD_EXPIRED')
    if (row.downloads >= row.maxDownloads) return err(res, 410, 'Das Download-Limit für diesen Link ist erreicht', 'DOWNLOAD_LIMIT')
    if (!['PAID', 'SHIPPED'].includes(row.order.status)) return err(res, 403, 'Für diese Bestellung ist der Download nicht freigegeben', 'DOWNLOAD_FORBIDDEN')

    const full = resolveStoredPath(row.file.storedName)
    const claimed = await prisma.shopDownloadToken.updateMany({
      where: { id: row.id, downloads: { lt: row.maxDownloads }, expiresAt: { gt: now } },
      data: { downloads: { increment: 1 }, lastDownloadAt: now },
    })
    if (claimed.count !== 1) return err(res, 410, 'Das Download-Limit für diesen Link ist erreicht', 'DOWNLOAD_LIMIT')

    const giveBack = () => Promise.resolve(prisma.shopDownloadToken.update({ where: { id: row.id }, data: { downloads: { decrement: 1 } } })).catch(() => {})
    let size
    try {
      if (!full) throw Object.assign(new Error('ungültiger Speichername'), { code: 'ENOENT' })
      size = (await fs.promises.stat(full)).size
    } catch (e) {
      await giveBack()
      if (e.code !== 'ENOENT') console.error('[shop/download] Datei nicht lesbar:', e.message)
      return err(res, 404, 'Die Datei ist nicht mehr verfügbar. Bitte den Shop kontaktieren.', 'FILE_MISSING')
    }

    const encoded = encodeURIComponent(row.file.filename).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Length', String(size))
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encoded)
    res.setHeader('X-Content-Type-Options', 'nosniff')

    const stream = fs.createReadStream(full)
    stream.on('error', async (e) => {
      console.error('[shop/download] Stream-Fehler:', e.message)
      if (!res.headersSent) {
        await giveBack()
        return err(res, 500, 'Download fehlgeschlagen', 'INTERNAL_ERROR')
      }
      res.destroy(e)
    })
    stream.pipe(res)
  } catch (e) {
    console.error('[/api/shop/download/[token] Error]', e.message)
    if (!res.headersSent) return err(res, 500, 'Interner Serverfehler', 'INTERNAL_ERROR')
    res.destroy()
  }
}
