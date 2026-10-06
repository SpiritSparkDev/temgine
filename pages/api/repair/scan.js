import { prisma } from '../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../lib/auth'
import { findSiblingSlugCollisions, findDuplicateIds, findMissingIds } from '../../../lib/pageTreeRepair'

// GET /api/repair/scan — prüft den kompletten Seitenbaum auf Datenintegritätsprobleme
// (Slug-Kollisionen zwischen echten Geschwister-Seiten, doppelte ids, fehlende
// ids), ohne den Baum selbst zu verändern. Unabhängig vom regulären Array-
// Save-Pfad in /api/pages, damit es auch funktioniert, wenn dieser wegen
// genau solcher Probleme blockiert ist.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Methode nicht erlaubt' })
  }

  const auth = await requireAuth(req, res, PERMISSIONS.SETTINGS_EDIT)
  if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })

  const pages = await prisma.page.findMany()
  const duplicateSlugs = findSiblingSlugCollisions(pages)
  const duplicateIds = findDuplicateIds(pages)
  const missingIds = findMissingIds(pages)

  return res.status(200).json({
    scannedAt: new Date().toISOString(),
    totalTopLevelPages: pages.length,
    duplicateSlugs,
    duplicateIds,
    missingIds,
  })
}
