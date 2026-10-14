import { prisma } from '../../lib/prisma'
import { logAudit } from '../../lib/audit'
import { sanitizeRecursive } from '../../lib/htmlSanitize'
import { validate, rules } from '../../lib/validate'
import { requireAuth, PERMISSIONS } from '../../lib/auth'
import { findSiblingSlugCollisions } from '../../lib/pageTreeRepair'
import { extractRedirectForSave } from '../../lib/pageRedirect'
import { hashPageAccessPasswords, stripPageAccessPasswords } from '../../lib/pageAccessPassword'
import {
  PAGES_VERSION_HEADER, computePagesVersion, acquirePagesLock, prepareTreeForWrite,
  rowContentChanged, ownContentChanged, savedStamp, stampNode, indexNodesById, replaceNestedNode, findSiblings,
} from '../../lib/pageConcurrency'
import { resolvePageViewer, filterPagesForViewer } from '../../lib/pageAccess'

// Löscht Revisionen, die älter als die konfigurierte Aufbewahrungsfrist sind
async function pruneRevisions(pageId) {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'revisionRetentionDays' } })
    const days = setting ? parseInt(setting.value, 10) : 30
    if (isNaN(days) || days < 0) return
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    await prisma.pageRevision.deleteMany({
      where: { pageId: String(pageId), createdAt: { lt: cutoff } },
    })
  } catch (e) {
    console.error('Revision pruning failed', e)
  }
}

function revisionSnapshot(page) {
  return {
    title: page.title,
    slug: page.slug,
    blocks: page.blocks,
    children: page.children,
    status: page.status,
    publishAt: page.publishAt,
    template: page.template,
    data: page.data
  }
}

function userLabel(user) {
  return (user && (user.name || user.email)) || null
}

// PUT /api/pages — speichert genau eine Seite (Top-Level oder verschachtelt),
// ohne den Rest des Baums anzufassen. `expectedSavedAt` ist der Stempel
// (data._savedAt), auf dem die Bearbeitung im Editor beruht; hat jemand
// anderes die Seite seitdem gespeichert, wird mit 409 abgelehnt statt dessen
// Änderungen zu überschreiben. Siehe lib/pageConcurrency.js.
async function saveSinglePage(req, res, auth, sanitizeBlockNode) {
  const { page: incoming, expectedSavedAt } = req.body || {}
  if (!incoming || typeof incoming !== 'object' || !incoming.id) {
    const [status, resp] = errorResponse(400, 'Seite mit id erforderlich', 'VALIDATION_ERROR', { missing: ['page.id'] });
    return res.status(status).json(resp);
  }
  const [pageOk, pageErrors] = validate(incoming, {
    slug:   [rules.required(), rules.string(), rules.maxLen(255)],
    title:  [rules.string(), rules.maxLen(300)],
    status: [rules.oneOf(['DRAFT','REVIEW','APPROVED','PUBLISHED','SCHEDULED'])],
  });
  if (!pageOk) {
    const [status, resp] = errorResponse(400, 'Ungültige Seitendaten', 'VALIDATION_ERROR', pageErrors);
    return res.status(status).json(resp);
  }

  // Unterseiten gehören zum Baum, nicht zum Editor — nie aus dem Request übernehmen.
  const p = { ...incoming }
  delete p.children
  delete p.passwordProtected
  await hashPageAccessPasswords(p)
  if (p.data) {
    const { data: dataWithoutRedirect, redirect } = extractRedirectForSave(p.data)
    p.data = sanitizeRecursive(dataWithoutRedirect)
    if (redirect) p.data.redirect = redirect
  }
  if (Array.isArray(p.blocks)) p.blocks = p.blocks.map(sanitizeBlockNode)

  const rows = await prisma.page.findMany()
  const hit = indexNodesById(rows).get(String(p.id))
  if (!hit) {
    const [status, resp] = errorResponse(404, 'Diese Seite existiert nicht mehr (wurde sie inzwischen gelöscht?). Deine Änderungen wurden nicht gespeichert.', 'PAGE_NOT_FOUND');
    return res.status(status).json(resp);
  }
  const current = hit.node
  const { savedAt, savedBy } = savedStamp(current)
  if ((expectedSavedAt || null) !== savedAt) {
    const [status, resp] = errorResponse(409, 'Diese Seite wurde inzwischen von jemand anderem gespeichert.', 'PAGE_CONFLICT', { savedAt, savedBy });
    return res.status(status).json(resp);
  }

  const siblings = findSiblings(rows, p.id) || []
  if (siblings.some(sib => sib && String(sib.id) !== String(p.id) && sib.slug === p.slug)) {
    const [status, resp] = errorResponse(400, `Der Slug "${p.slug}" wird unter derselben Elternseite bereits verwendet.`, 'VALIDATION_ERROR', { duplicateSlugs: [p.slug] });
    return res.status(status).json(resp);
  }

  const passwordChanged = p.accessPasswordHash !== undefined
  if (!passwordChanged && !ownContentChanged(current, p)) {
    return res.status(200).json({ page: stripPageAccessPasswords(current), savedAt })
  }

  const data = { ...(p.data || {}) }
  // Sortierposition gehört dem Baum (siehe POST), nicht dem Editor-Stand.
  if (current.data && current.data._order !== undefined) data._order = current.data._order
  else delete data._order
  const own = stampNode({
    title: p.title || '',
    slug: String(p.slug),
    template: p.template || null,
    blocks: Array.isArray(p.blocks) ? p.blocks : (current.blocks || []),
    data,
    status: p.status || current.status || 'DRAFT',
    publishAt: p.publishAt !== undefined ? (p.publishAt || null) : (current.publishAt || null),
    isHomepage: p.isHomepage !== undefined ? Boolean(p.isHomepage) : Boolean(current.isHomepage),
    accessGroups: Array.isArray(p.accessGroups) ? p.accessGroups : (current.accessGroups || []),
    ...(passwordChanged ? { accessPasswordHash: p.accessPasswordHash } : {}),
  }, auth.user)

  if (own.isHomepage) {
    try {
      await prisma.page.updateMany({ where: { isHomepage: true, id: { not: hit.topLevelId } }, data: { isHomepage: false } })
    } catch (e) {
      console.error('Error updating homepages:', e)
    }
  }

  const isTopLevel = hit.topLevelId === String(p.id)
  let updatedRow
  if (isTopLevel) {
    updatedRow = await prisma.page.update({ where: { id: hit.topLevelId }, data: own })
  } else {
    const row = rows.find(r => String(r.id) === hit.topLevelId)
    const children = replaceNestedNode(row.children, p.id, (n) => ({ ...n, ...own, children: n.children }))
    updatedRow = await prisma.page.update({ where: { id: hit.topLevelId }, data: { children } })
  }
  const saved = indexNodesById([updatedRow]).get(String(p.id)).node

  try {
    await prisma.pageRevision.create({ data: {
      pageId: updatedRow.id,
      data: revisionSnapshot(updatedRow),
      createdBy: userLabel(auth.user),
      note: isTopLevel ? null : `Unterseite „${saved.title || saved.slug}“ bearbeitet`
    } })
    await pruneRevisions(updatedRow.id)
  } catch (e) {
    console.error('Revision create failed', e)
  }
  try { await logAudit({ action: 'update', resource: 'page', resourceId: String(p.id), userId: auth.user.id, details: { slug: saved.slug, topLevelId: updatedRow.id } }) } catch (e) {}

  return res.status(200).json({ page: stripPageAccessPasswords(saved), savedAt: saved.data._savedAt })
}

// Standardized error response helper
const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

// API-Route für Seiten: Daten kommen jetzt ausschließlich aus der Datenbank
export default async function handler(req, res) {
  try {
    const normalizeSlotName = (value) => {
      if (value === undefined || value === null) return ''
      return String(value).trim().replace(/\s+/g, '-')
    }

    // Freies HTML-Feld (Block ohne Template, props.html): bleibt roh erhalten, wenn der Nutzer
    // Templates bearbeiten darf (ADMIN/MODERATOR) oder der Wert bereits unverändert so gespeichert ist
    // (damit ein Editor beim Speichern fremdes HTML nicht beschädigt). Sonst normal bereinigt.
    let rawHtmlAllowed = () => false

    const sanitizeBlockNode = (block) => {
      if (!block || typeof block !== 'object') return block

      const next = { ...block }
      if (next.hidden !== undefined) {
        next.hidden = Boolean(next.hidden)
      }
      if (next.props && typeof next.props === 'object') {
        const { html, ...rest } = next.props
        next.props = sanitizeRecursive(rest)
        if (typeof html === 'string') {
          next.props.html = (!next.template && rawHtmlAllowed(html)) ? html : sanitizeRecursive(html)
        }
      }

      if (next.slot !== undefined) {
        const normalizedSlot = normalizeSlotName(next.slot)
        if (normalizedSlot) {
          next.slot = normalizedSlot
        } else {
          delete next.slot
        }
      }

      if (Array.isArray(next.children)) {
        next.children = next.children.map(sanitizeBlockNode)
      }

      return next
    }

    // GET: alle Seiten oder eine Seite per ?slug=...
    if (req.method === 'GET') {
      const slug = req.query && req.query.slug
      const includeDraftsRequested = req.query && (req.query.includeDrafts === 'true' || req.query.includeDrafts === true)
      // Wer fragt? Entwürfe nur für Backend-Nutzer, Inhalte geschützter
      // Mitglieder-Seiten nur für berechtigte Mitglieder (lib/pageAccess.js).
      const viewer = await resolvePageViewer(req, res)
      const includeDrafts = includeDraftsRequested && viewer.isStaff
      // Antwort hängt von der Anmeldung ab — nicht in geteilten Caches ablegen.
      res.setHeader('Cache-Control', 'private, no-store')
      res.setHeader('Vary', 'Cookie')
      if (slug) {
        const page = await prisma.page.findUnique({ where: { slug: String(slug) } })
        const [visible] = page ? filterPagesForViewer([page], viewer, { includeDrafts }) : []
        if (!visible) {
          const [status, resp] = errorResponse(404, 'Seite nicht gefunden', 'PAGE_NOT_FOUND');
          return res.status(status).json(resp);
        }
        return res.status(200).json(stripPageAccessPasswords(visible))
      }

      // Ohne Berechtigung für Entwürfe bleibt eine unveröffentlichte Startseite
      // wie bisher über includeDrafts erreichbar (Fallback in pages/index.js).
      const where = includeDrafts
        ? {}
        : includeDraftsRequested
          ? { OR: [{ status: 'PUBLISHED' }, { isHomepage: true }] }
          : { status: 'PUBLISHED' }

      // Get all root-level pages (those without a parent). To preserve editing order,
      // we don't strictly orderBy createdAt. Instead, let the client manage order via children array.
      // Return pages with minimal ordering (updatedAt desc) so recently modified appear first,
      // but rely on the client to send the full tree structure in the desired order on save.
      const pages = await prisma.page.findMany({ where })
      // Restore user-defined sort order (stored as data._order on each top-level page)
      pages.sort((a, b) => {
        const ao = (a.data && typeof a.data._order === 'number') ? a.data._order : 99999
        const bo = (b.data && typeof b.data._order === 'number') ? b.data._order : 99999
        return ao !== bo ? ao - bo : (a.createdAt < b.createdAt ? -1 : 1)
      })
      // Die Version gehört zu genau diesem Baum — der Admin schickt sie bei
      // strukturellen Speicherungen zurück (siehe lib/pageConcurrency.js).
      if (includeDrafts) res.setHeader('X-Pages-Version', computePagesVersion(pages))
      return res.status(200).json(filterPagesForViewer(pages, viewer, { includeDrafts }).map(stripPageAccessPasswords))
    }

    // POST: Seitenbaum (Array) oder einzelne Seite per slug speichern
    // PUT:  eine einzelne Seite (auch verschachtelt) per id speichern — der Weg des Seiten-Editors
    if (req.method === 'POST' || req.method === 'PUT') {
      const auth = await requireAuth(req, res, PERMISSIONS.PAGES_EDIT)
      if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })

      if (PERMISSIONS.TEMPLATES_EDIT.includes(auth.user.role)) {
        rawHtmlAllowed = () => true
      } else {
        const stored = new Set()
        const walk = (nodes) => (nodes || []).forEach((b) => {
          if (b && typeof b.props?.html === 'string') stored.add(b.props.html)
          walk(b?.children)
        })
        const walkPages = (pgs) => (Array.isArray(pgs) ? pgs : []).forEach((p) => { walk(p?.blocks); walkPages(p?.children) })
        walkPages(await prisma.page.findMany({ select: { blocks: true, children: true } }))
        rawHtmlAllowed = (v) => stored.has(v)
      }

      const body = req.body

      if (req.method === 'PUT') {
        const release = await acquirePagesLock()
        try {
          return await saveSinglePage(req, res, auth, sanitizeBlockNode)
        } finally {
          release()
        }
      }

      // Wenn ein Array gesendet wird, upserten wir alle Einträge
      if (Array.isArray(body)) {
       const release = await acquirePagesLock()
       try {
        const results = []

        // Neue Seiten anlegen braucht PAGES_CREATE (Default: wie PAGES_EDIT).
        {
          const existing = new Set((await prisma.page.findMany({ select: { slug: true } })).map(r => r.slug))
          if (body.some(b => b && b.slug && !existing.has(String(b.slug))) && !PERMISSIONS.PAGES_CREATE.includes(auth.user.role)) {
            return res.status(403).json({ error: 'Keine Berechtigung, Seiten anzulegen', code: 'FORBIDDEN' })
          }
        }

        // Veralteter Baum? Dann nichts schreiben — sonst überschreibt er fremde
        // Änderungen und löscht Seiten, die andere inzwischen angelegt haben.
        const dbRowsBefore = await prisma.page.findMany()
        const clientVersion = req.headers[PAGES_VERSION_HEADER]
        if (!clientVersion || clientVersion !== computePagesVersion(dbRowsBefore)) {
          const [status, resp] = errorResponse(
            409,
            'Der Seitenbaum wurde inzwischen von jemand anderem geändert. Deine Änderung wurde nicht gespeichert, damit nichts überschrieben wird. Die Seitenliste wurde neu geladen — bitte die Aktion wiederholen.',
            'PAGES_TREE_CONFLICT'
          );
          return res.status(status).json(resp);
        }
        const dbRowsById = new Map(dbRowsBefore.map(r => [String(r.id), r]))

        // helper: collect only TOP-LEVEL slugs from the provided array.
        // Children are stored as JSON inside their parent's `children` column
        // and do NOT have their own DB rows, so we must NOT recurse into them —
        // otherwise a deleted top-level page whose slug still appears in another
        // page's children JSON would never be removed from the DB.
        const collectSlugs = (nodes) => {
          const s = new Set()
          for (const n of nodes || []) {
            if (n && n.slug) s.add(String(n.slug))
          }
          return s
        }

        const providedSlugs = collectSlugs(body)
        // Fehlende Seiten im Baum bedeuten Löschen -> PAGES_DELETE, und zwar vor dem ersten Schreiben.
        if (!PERMISSIONS.PAGES_DELETE.includes(auth.user.role)) {
          if (dbRowsBefore.some(r => !providedSlugs.has(r.slug))) {
            return res.status(403).json({ error: 'Keine Berechtigung, Seiten zu löschen', code: 'FORBIDDEN' })
          }
        }

        // Slugs müssen nur innerhalb derselben Geschwister-Gruppe eindeutig sein
        // (alle Top-Level-Seiten untereinander, oder alle Kinder eines einzelnen
        // `children`-Arrays untereinander): findPageByPath löst URLs Segment für
        // Segment auf und sucht dabei pro Schritt immer nur innerhalb der Kinder
        // des zuvor gefundenen Knotens — zwei gleich benannte Seiten unter
        // UNTERSCHIEDLICHEN Elternseiten sind also über unterschiedliche URLs
        // erreichbar und kein Problem. Nur wenn zwei Geschwister denselben Slug
        // tragen, wäre der zweite über keine URL erreichbar. Nur die Top-Level-
        // Slugs sind zusätzlich per DB-Constraint geschützt; verschachtelte
        // Slugs (im `children`-JSON) müssen wir hier selbst prüfen, bevor
        // irgendetwas geschrieben wird. (Siehe lib/pageTreeRepair.js, das dieselbe
        // Prüfung auch für das /repair-Werkzeug nutzt.)
        const slugCollisions = findSiblingSlugCollisions(body)
        if (slugCollisions.length > 0) {
          const duplicateSlugs = slugCollisions.map(c => c.slug)
          const [status, resp] = errorResponse(
            400,
            `Slug(s) mehrfach unter derselben übergeordneten Seite vergeben: ${duplicateSlugs.join(', ')}. Jeder Slug muss unter seiner Elternseite eindeutig sein.`,
            'VALIDATION_ERROR',
            { duplicateSlugs }
          );
          return res.status(status).json(resp);
        }

        // Zusätzliche Absicherung: dieselbe Seite (gleiche id) darf nicht an
        // mehreren Stellen im Baum auftauchen. Das ist das Muster, das beim
        // Verschieben/Verschachteln einer Seite (Drag & Drop im Editor) zu
        // "Seite erscheint mehrfach" führen würde, falls ein Client-Bug eine
        // Seite kopiert statt verschiebt — lieber die ganze Speicherung
        // ablehnen, als so einen Baum persistieren.
        const findDuplicateIds = (nodes) => {
          const seen = new Set()
          const dupes = new Set()
          const walk = (list) => {
            for (const n of list || []) {
              if (n && n.id) {
                const id = String(n.id)
                if (seen.has(id)) dupes.add(id)
                else seen.add(id)
              }
              if (n && Array.isArray(n.children)) walk(n.children)
            }
          }
          walk(nodes)
          return [...dupes]
        }
        const duplicateIds = findDuplicateIds(body)
        if (duplicateIds.length > 0) {
          const [status, resp] = errorResponse(
            400,
            `Seite(n) kommen mehrfach im Baum vor (id: ${duplicateIds.join(', ')}). Bitte Seite neu laden und den Verschiebe-/Duplizier-Vorgang erneut versuchen.`,
            'VALIDATION_ERROR',
            { duplicateIds }
          );
          return res.status(status).json(resp);
        }

        // Stamp top-level sort order into data so GET can restore it
        for (let _i = 0; _i < body.length; _i++) {
          if (body[_i]) body[_i].data = { ...(body[_i].data || {}), _order: _i }
        }

        // Only upsert top-level nodes; children are stored in the parent's `children` JSON
        for (const p of body) {
          // newAccessPassword/clearAccessPassword (Klartext bzw. Löschflag vom
          // Editor) in accessPasswordHash umwandeln — rekursiv, erfasst also
          // auch verschachtelte Seiten im `children`-JSON dieses Knotens.
          if (p) await hashPageAccessPasswords(p)
          // sanitize incoming page content (blocks.props, data)
          try {
            if (p && p.data) {
              // redirect.url ist keine Rich-Text-HTML, sondern eine URL — sanitizeRecursive
              // würde deren "&" (Query-String) zu "&amp;" escapen, siehe lib/pageRedirect.js.
              const { data: dataWithoutRedirect, redirect } = extractRedirectForSave(p.data)
              p.data = sanitizeRecursive(dataWithoutRedirect)
              if (redirect) p.data.redirect = redirect
            }
            if (p && p.blocks && Array.isArray(p.blocks)) {
              p.blocks = p.blocks.map(sanitizeBlockNode)
            }
          } catch (e) {
            console.warn('Failed to sanitize incoming page payload', e)
          }
        }
        prepareTreeForWrite(body, dbRowsBefore, auth.user)

        for (const p of body) {
          if (!p || !p.slug) continue

          try {
            // Wenn diese Seite als Homepage gesetzt wird, deaktiviere alle anderen Homepages
            if (p.isHomepage === true) {
              await prisma.page.updateMany({
                where: { isHomepage: true, slug: { not: String(p.slug) } },
                data: { isHomepage: false }
              })
            }
          } catch (e) {
            console.error('Error updating homepages:', e);
          }

          const up = await prisma.page.upsert({
            where: { slug: String(p.slug) },
            create: {
              slug: String(p.slug),
              title: p.title || '',
              blocks: p.blocks || [],
              children: p.children || [],
              status: p.status || 'DRAFT',
              publishAt: p.publishAt || null,
              template: p.template || null,
              data: p.data || {},
              isHomepage: p.isHomepage || false,
              accessGroups: Array.isArray(p.accessGroups) ? p.accessGroups : [],
              accessPasswordHash: p.accessPasswordHash || null
            },
            update: {
              title: p.title || undefined,
              blocks: p.blocks || undefined,
              children: p.children || undefined,
              status: p.status || undefined,
              publishAt: p.publishAt || undefined,
              template: p.template || undefined,
              data: p.data || undefined,
              isHomepage: p.isHomepage !== undefined ? p.isHomepage : undefined,
              accessGroups: Array.isArray(p.accessGroups) ? p.accessGroups : undefined,
              accessPasswordHash: p.accessPasswordHash !== undefined ? p.accessPasswordHash : undefined
            }
          })
          results.push(up)
        }

        // Revision nur für Seiten, die sich tatsächlich geändert haben — und
        // vollständig (inkl. Template-Feldern in `data`), sonst lässt sich der
        // Inhalt von Template-Seiten daraus nicht wiederherstellen.
        for (const up of results) {
          const before = dbRowsById.get(String(up.id))
          if (before && !rowContentChanged(before, up)) continue
          try {
            await prisma.pageRevision.create({ data: {
              pageId: up.id,
              data: revisionSnapshot(up),
              createdBy: userLabel(auth.user)
            } })
            await pruneRevisions(up.id)
          } catch (e) {
            console.error('Revision create failed', e)
          }
        }

        // Remove pages that are no longer present in the provided tree
        try {
          const allPages = await prisma.page.findMany()
          const existingSlugs = allPages.map(p => p.slug)
          const toDelete = existingSlugs.filter(s => !providedSlugs.has(s))

          if (toDelete.length > 0) {
            // Find matching DB entries for the toDelete slugs
            const pagesToDelete = await prisma.page.findMany({ where: { slug: { in: toDelete } } })
            const slugsFound = pagesToDelete.map(p => p.slug)
            if (slugsFound.length > 0) {
              // Bulk delete for efficiency
              await prisma.page.deleteMany({ where: { slug: { in: slugsFound } } })
              // Create audit logs per deleted page
              for (const pd of pagesToDelete) {
                try { await logAudit({ action: 'delete', resource: 'page', resourceId: pd.id, userId: auth.user.id, details: { slug: pd.slug } }) } catch (e) { console.error('Audit log failed for deleted page', pd.slug, e) }
                console.log('DEBUG /api/pages POST deleted and audited:', pd.slug)
              }
            } else {
              console.log('DEBUG /api/pages POST no matching pages found to delete for slugs:', toDelete)
            }
          }
        } catch (e) {
          console.error('Failed to clean up removed pages:', e)
        }

        console.log('DEBUG /api/pages POST upsert results:', results.map(r => ({ id: r.id, slug: r.slug, status: r.status })));
        // audit logs for upserts
        for (const up of results) {
          try { await logAudit({ action: 'upsert', resource: 'page', resourceId: up.id, userId: auth.user.id, details: { slug: up.slug } }) } catch (e) {}
        }
        // Neue Version unter dem Lock ermitteln: Sie beschreibt exakt den Baum,
        // den dieser Client gerade gesendet hat.
        res.setHeader('X-Pages-Version', computePagesVersion(await prisma.page.findMany({ select: { id: true, updatedAt: true } })))
        return res.status(200).json(results.map(stripPageAccessPasswords))
       } finally {
        release()
       }
      }

      // Single page upsert
      const p = body || {}
      if (p) await hashPageAccessPasswords(p)
      // sanitize single payload
      try {
        if (p && p.data) {
          const { data: dataWithoutRedirect, redirect } = extractRedirectForSave(p.data)
          p.data = sanitizeRecursive(dataWithoutRedirect)
          if (redirect) p.data.redirect = redirect
        }
        if (p && p.blocks && Array.isArray(p.blocks)) {
          p.blocks = p.blocks.map(sanitizeBlockNode)
        }
      } catch (e) {
        console.warn('Failed to sanitize incoming single page payload', e)
      }
      if (!p.slug) {
        const [status, resp] = errorResponse(400, 'Slug erforderlich', 'VALIDATION_ERROR', { missing: ['slug'] });
        return res.status(status).json(resp);
      }
      // Validate single page fields
      const [pageOk, pageErrors] = validate(p, {
        slug:   [rules.required(), rules.string(), rules.maxLen(255)],
        title:  [rules.string(), rules.maxLen(300)],
        status: [rules.oneOf(['DRAFT','REVIEW','APPROVED','PUBLISHED','SCHEDULED'])],
      });
      if (!pageOk) {
        const [status, resp] = errorResponse(400, 'Ungültige Seitendaten', 'VALIDATION_ERROR', pageErrors);
        return res.status(status).json(resp);
      }
      stampNode(p, auth.user)
      if (!PERMISSIONS.PAGES_CREATE.includes(auth.user.role) && !(await prisma.page.findUnique({ where: { slug: String(p.slug) }, select: { id: true } }))) {
        return res.status(403).json({ error: 'Keine Berechtigung, Seiten anzulegen', code: 'FORBIDDEN' })
      }
      const up = await prisma.page.upsert({
        where: { slug: String(p.slug) },
        create: {
          slug: String(p.slug),
          title: p.title || '',
          blocks: p.blocks || [],
          children: p.children || [],
          template: p.template || null,
          data: p.data || {},
          status: p.status || 'DRAFT',
          publishAt: p.publishAt || null,
          isHomepage: p.isHomepage || false,
          accessGroups: Array.isArray(p.accessGroups) ? p.accessGroups : [],
          accessPasswordHash: p.accessPasswordHash || null
        },
        update: {
          title: p.title || undefined,
          blocks: p.blocks || undefined,
          children: p.children || undefined,
          template: p.template || undefined,
          data: p.data || undefined,
          status: p.status || undefined,
          publishAt: p.publishAt !== undefined ? (p.publishAt || null) : undefined,
          isHomepage: p.isHomepage !== undefined ? p.isHomepage : undefined,
          accessGroups: Array.isArray(p.accessGroups) ? p.accessGroups : undefined,
          accessPasswordHash: p.accessPasswordHash !== undefined ? p.accessPasswordHash : undefined
        }
      })
      // create a revision for this upsert
      try {
        await prisma.pageRevision.create({ data: {
          pageId: up.id,
          data: revisionSnapshot(up),
          createdBy: userLabel(auth.user)
        } })
        await pruneRevisions(up.id)
      } catch (e) {
        console.error('Revision create failed', e)
      }
      try { await logAudit({ action: 'upsert', resource: 'page', resourceId: up.id, userId: auth.user.id, details: { slug: up.slug } }) } catch (e) {}
      return res.status(200).json(stripPageAccessPasswords(up))
    }

    // DELETE: Seite per slug löschen
    if (req.method === 'DELETE') {
      const auth = await requireAuth(req, res, PERMISSIONS.PAGES_DELETE)
      if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })

      const { slug } = req.body || {}
      if (!slug) {
        const [status, resp] = errorResponse(400, 'Slug erforderlich', 'VALIDATION_ERROR', { missing: ['slug'] });
        return res.status(status).json(resp);
      }
      try {
        const deleted = await prisma.page.delete({ where: { slug: String(slug) } })
        try { await logAudit({ action: 'delete', resource: 'page', resourceId: deleted.id, userId: auth.user.id, details: { slug } }) } catch (e) {}
        return res.status(200).json({ ok: true })
      } catch (e) {
        if (e.code === 'P2025') {
          const [status, resp] = errorResponse(404, 'Seite nicht gefunden', 'PAGE_NOT_FOUND');
          return res.status(status).json(resp);
        }
        throw e;
      }
    }

    const [status, resp] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
    return res.status(status).json(resp);
  } catch (e) {
    console.error('[/api/pages Error]', e.message, e.stack)
    const [status, resp] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', { message: process.env.NODE_ENV === 'production' ? undefined : e.message });
    return res.status(status).json(resp);
  }
}
