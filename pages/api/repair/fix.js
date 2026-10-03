import crypto from 'crypto'
import { prisma } from '../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../lib/auth'
import { logAudit } from '../../../lib/audit'
import { rules } from '../../../lib/validate'
import {
  findSiblingSlugCollisions,
  getNodeAtPath,
  updateNodeAtPath,
  pathsEqual,
} from '../../../lib/pageTreeRepair'

// POST /api/repair/fix — behebt EIN einzelnes gefundenes Problem gezielt,
// indem nur die betroffene Top-Level-Seite geschrieben wird (nicht der
// gesamte Baum wie beim normalen Array-Save). Body:
//   { type: 'slug', topLevelId, path: number[], newValue: string }
//   { type: 'id',   topLevelId, path: number[] }  (neue id wird serverseitig erzeugt)
// `path: []` bezieht sich auf die Top-Level-Seite selbst.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Methode nicht erlaubt' })
  }

  const auth = await requireAuth(req, res, PERMISSIONS.SETTINGS_EDIT)
  if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })

  const { type, topLevelId, path, newValue } = req.body || {}
  if (!topLevelId || !Array.isArray(path)) {
    return res.status(400).json({ error: 'topLevelId und path sind erforderlich' })
  }
  if (type !== 'slug' && type !== 'id') {
    return res.status(400).json({ error: 'type muss "slug" oder "id" sein' })
  }

  const topLevelPage = await prisma.page.findUnique({ where: { id: String(topLevelId) } })
  if (!topLevelPage) return res.status(404).json({ error: 'Seite nicht gefunden' })

  const targetNode = getNodeAtPath(topLevelPage, path)
  if (!targetNode) {
    return res.status(404).json({ error: 'Knoten im Seitenbaum nicht gefunden — der Baum hat sich evtl. seit dem letzten Scan geändert. Bitte erneut scannen.' })
  }

  if (type === 'id') {
    if (path.length === 0) {
      return res.status(400).json({ error: 'Die id einer Top-Level-Seite kann hier nicht geändert werden, da Revisionen/Workflow-Einträge über die id darauf verweisen.' })
    }
    const newId = crypto.randomUUID()
    const newChildren = updateNodeAtPath(topLevelPage, path, { id: newId })
    await prisma.page.update({ where: { id: String(topLevelId) }, data: { children: newChildren } })

    await logAudit({
      action: 'REPAIR_FIX_ID',
      resource: 'Page',
      resourceId: String(topLevelId),
      userId: auth.user?.id,
      details: { path, oldValue: targetNode.id, newValue: newId, title: targetNode.title },
    })

    return res.status(200).json({ success: true, newValue: newId })
  }

  // type === 'slug'
  const candidate = String(newValue || '').trim()
  if (!candidate) return res.status(400).json({ error: 'Neuer Slug darf nicht leer sein' })
  const slugError = rules.slug()(candidate, 'Slug')
  if (slugError) return res.status(400).json({ error: slugError })

  // Simuliere die Änderung im Speicher und prüfe, ob sie eine NEUE Kollision
  // mit einer anderen Geschwister-Seite erzeugen würde, bevor irgendetwas geschrieben wird.
  const allPages = await prisma.page.findMany()
  const simulated = allPages.map((p) => {
    if (p.id !== String(topLevelId)) return p
    if (path.length === 0) return { ...p, slug: candidate }
    return { ...p, children: updateNodeAtPath(p, path, { slug: candidate }) }
  })
  const stillColliding = findSiblingSlugCollisions(simulated).some((c) =>
    c.occurrences.some((o) => o.topLevelId === String(topLevelId) && pathsEqual(o.path, path))
  )
  if (stillColliding) {
    return res.status(409).json({ error: `Der Slug "${candidate}" ist unter derselben übergeordneten Seite bereits vergeben. Bitte einen anderen Wert wählen.` })
  }

  if (path.length === 0) {
    try {
      await prisma.page.update({ where: { id: String(topLevelId) }, data: { slug: candidate } })
    } catch (e) {
      return res.status(409).json({ error: 'Dieser Slug ist bereits als Top-Level-Seite vergeben (Datenbank-Eindeutigkeit).' })
    }
  } else {
    const newChildren = updateNodeAtPath(topLevelPage, path, { slug: candidate })
    await prisma.page.update({ where: { id: String(topLevelId) }, data: { children: newChildren } })
  }

  await logAudit({
    action: 'REPAIR_FIX_SLUG',
    resource: 'Page',
    resourceId: String(topLevelId),
    userId: auth.user?.id,
    details: { path, oldValue: targetNode.slug, newValue: candidate, title: targetNode.title },
  })

  return res.status(200).json({ success: true, newValue: candidate })
}
