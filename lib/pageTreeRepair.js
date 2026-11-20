// Werkzeuge für das Reparatur-Feature (pages/repair.js, pages/api/repair/*):
// findet und behebt Datenintegritätsprobleme im Seitenbaum, die das reguläre
// Array-Save (pages/api/pages.js) blockieren, aber selbst nicht darauf
// angewiesen sind, den GESAMTEN Baum unverändert mitzuspeichern — sie
// schreiben gezielt nur die betroffene Top-Level-Seite.
//
// Wichtig: Echte URL-Kollisionen entstehen nur zwischen SIBLINGS (Knoten im
// selben `children`-Array bzw. beide auf Top-Level), weil findPageByPath
// (pages/[...slug].js) pro URL-Segment nur innerhalb der Kinder des zuvor
// gefundenen Knotens sucht. Zwei gleich benannte Seiten unter verschiedenen
// Eltern sind technisch kein Problem und werden hier bewusst NICHT als
// Kollision gemeldet (anders als die global über den ganzen Baum prüfende
// Validierung in pages/api/pages.js).

export function walkAll(topLevelPages, visit) {
  for (const [topIndex, top] of (topLevelPages || []).entries()) {
    const walk = (node, path, ancestorTitles, parentKey) => {
      if (!node) return
      const label = node.title || node.slug || '(ohne Titel)'
      const breadcrumb = [...ancestorTitles, label].join(' › ')
      visit(node, { topLevelId: top.id, path, breadcrumb, parentKey })
      const children = Array.isArray(node.children) ? node.children : []
      // Position statt top.id: neue, noch nie gespeicherte Seiten haben keine id –
      // sonst bekämen Unterseiten verschiedener neuer Top-Level-Seiten denselben
      // Schlüssel "undefined::…" und gälten fälschlich als Geschwister.
      const childParentKey = `${topIndex}::${path.join('.')}`
      children.forEach((child, i) => walk(child, [...path, i], [...ancestorTitles, label], childParentKey))
    }
    walk(top, [], [], 'root')
  }
}

// Doppelte Slugs innerhalb derselben Geschwister-Gruppe (= echte, unerreichbare Seite)
export function findSiblingSlugCollisions(topLevelPages) {
  const groups = new Map() // parentKey -> Map(slug -> occurrences[])
  walkAll(topLevelPages, (node, ctx) => {
    if (!node.slug) return
    if (!groups.has(ctx.parentKey)) groups.set(ctx.parentKey, new Map())
    const bySlug = groups.get(ctx.parentKey)
    const slug = String(node.slug)
    if (!bySlug.has(slug)) bySlug.set(slug, [])
    bySlug.get(slug).push({
      topLevelId: ctx.topLevelId,
      path: ctx.path,
      id: node.id,
      title: node.title || '',
      breadcrumb: ctx.breadcrumb,
      isTopLevel: ctx.path.length === 0,
    })
  })
  const result = []
  for (const bySlug of groups.values()) {
    for (const [slug, occurrences] of bySlug.entries()) {
      if (occurrences.length > 1) result.push({ slug, occurrences })
    }
  }
  return result
}

// Dieselbe id mehrfach im Baum (immer ein echtes Problem, unabhängig von der Position)
export function findDuplicateIds(topLevelPages) {
  const byId = new Map()
  walkAll(topLevelPages, (node, ctx) => {
    if (!node.id) return
    const id = String(node.id)
    if (!byId.has(id)) byId.set(id, [])
    byId.get(id).push({
      topLevelId: ctx.topLevelId,
      path: ctx.path,
      slug: node.slug || '',
      title: node.title || '',
      breadcrumb: ctx.breadcrumb,
      isTopLevel: ctx.path.length === 0,
    })
  })
  const result = []
  for (const [id, occurrences] of byId.entries()) {
    if (occurrences.length > 1) result.push({ id, occurrences })
  }
  return result
}

// Verschachtelte Knoten ohne id (kommt bei älteren/importierten Datenbeständen
// vor). Gefährlich, weil Client-Code, der Knoten per id findet/ersetzt (z. B.
// PagesView.js updatePageInTree), bei mehreren Geschwistern mit `id === undefined`
// ALLE davon trifft, statt nur den gemeinten — das erzeugt beim nächsten
// Speichern einer dieser Seiten frisch neue Slug-Duplikate, selbst wenn die DB
// zum Zeitpunkt des Scans völlig unauffällig ist.
export function findMissingIds(topLevelPages) {
  const result = []
  walkAll(topLevelPages, (node, ctx) => {
    if (ctx.path.length === 0) return // Top-Level-ids kommen immer von der DB (@default(cuid()))
    if (node.id) return
    result.push({
      topLevelId: ctx.topLevelId,
      path: ctx.path,
      slug: node.slug || '',
      title: node.title || '',
      breadcrumb: ctx.breadcrumb,
      isTopLevel: false,
    })
  })
  return result
}

// Dieselbe Block-id auf mehreren Seiten = geteilter Block (lib/sharedBlocks.js): Speichern
// einer Seite überschreibt alle anderen. Gewollt bei echten geteilten Blöcken, ein
// Datenfehler bei importierten Seiten, die alle z. B. id "gf-project" tragen — daher nur
// melden, die Entscheidung pro Seite trifft der Admin.
export function findDuplicateBlockIds(topLevelPages) {
  const byId = new Map()
  walkAll(topLevelPages, (node, ctx) => {
    const seen = new Set()
    const visit = (blocks) => {
      for (const b of Array.isArray(blocks) ? blocks : []) {
        if (!b || typeof b !== 'object') continue
        if (b.id && !seen.has(b.id)) {
          seen.add(b.id)
          if (!byId.has(b.id)) byId.set(b.id, [])
          byId.get(b.id).push({
            topLevelId: ctx.topLevelId,
            path: ctx.path,
            slug: node.slug || '',
            title: node.title || '',
            breadcrumb: ctx.breadcrumb,
            isTopLevel: ctx.path.length === 0,
          })
        }
        visit(b.children)
      }
    }
    visit(node.blocks)
  })
  return [...byId.entries()].filter(([, o]) => o.length > 1).map(([id, occurrences]) => ({ id, occurrences }))
}

// Kopie von `blocks`, in der jeder Block mit id `blockId` eine neue id aus `makeId()` bekommt.
export function reassignBlockId(blocks, blockId, makeId) {
  return (Array.isArray(blocks) ? blocks : []).map((b) => {
    if (!b || typeof b !== 'object') return b
    const next = b.id === blockId ? { ...b, id: makeId() } : { ...b }
    if (Array.isArray(b.children)) next.children = reassignBlockId(b.children, blockId, makeId)
    return next
  })
}

export function getNodeAtPath(topLevelPage, path) {
  let node = topLevelPage
  for (const i of path) {
    const children = Array.isArray(node.children) ? node.children : []
    node = children[i]
    if (!node) return null
  }
  return node
}

// Liefert ein NEUES `children`-Array für die Top-Level-Seite, bei dem der Knoten
// an `path` (path.length > 0 — Top-Level-Felder werden vom Aufrufer direkt per
// prisma.page.update gesetzt) mit `patch` zusammengeführt ist. Mutiert nichts am Original.
export function updateNodeAtPath(topLevelPage, path, patch) {
  const cloneNode = (node) => ({ ...node, children: Array.isArray(node.children) ? node.children.map(cloneNode) : [] })
  const newChildren = (Array.isArray(topLevelPage.children) ? topLevelPage.children : []).map(cloneNode)
  let arr = newChildren
  for (let d = 0; d < path.length - 1; d++) {
    arr = arr[path[d]].children
  }
  const idx = path[path.length - 1]
  if (!arr[idx]) return null
  arr[idx] = { ...arr[idx], ...patch }
  return newChildren
}

export function pathsEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])
}
