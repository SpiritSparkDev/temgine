import { prisma } from '../../../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../../../lib/auth'
import { logAudit } from '../../../../../../lib/audit'
import { requireShopEnabled } from '../../../../../../lib/shop/guard'
import { removeStoredFile } from '../../../../../../lib/shop/downloads'

/** Download-Datei löschen (Zeile + Datei; Tokens verfallen per Cascade). */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_PRODUCTS_EDIT)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return
    if (req.method !== 'DELETE') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })

    const { formatId, fileId } = req.query
    const file = await prisma.shopDigitalFile.findFirst({ where: { id: fileId, formatId } })
    if (!file) return res.status(404).json({ error: 'Datei nicht gefunden', code: 'NOT_FOUND' })

    await prisma.shopDigitalFile.delete({ where: { id: file.id } })
    await removeStoredFile(file.storedName)
    await logAudit({ action: 'shop.file.delete', resource: 'shop-format', resourceId: formatId, userId: auth.user.id, details: { fileId: file.id, filename: file.filename } })
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[/api/shop/formats/[formatId]/files/[fileId] Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
