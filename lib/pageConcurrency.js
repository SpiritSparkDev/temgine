// Schutz vor verlorenen Änderungen, wenn mehrere Personen gleichzeitig im
// Backend arbeiten.
//
// Zwei Ebenen:
//
// 1. Seitenbaum-Version (`computePagesVersion`): Strukturelle Speicherungen
//    (Drag & Drop, Anlegen/Löschen, Block-Übertragung) schicken weiterhin den
//    kompletten Baum. Der Client sendet die Version mit, die er zusammen mit
//    dem Baum geladen hat (Header `X-Pages-Version`); passt sie nicht mehr zum
//    Stand in der DB, wird abgelehnt (409) statt fremde Änderungen mit einem
//    veralteten Baum zu überschreiben bzw. fremde neue Seiten zu löschen.
//    Die Version leitet sich aus Anzahl und jüngstem `updatedAt` der
//    Top-Level-Zeilen ab — jede Schreiboperation auf `Page` (auch Workflow,
//    Veröffentlichen, Reparatur) ändert sie also automatisch.
//
// 2. Knoten-Stempel (`data._savedAt` / `data._savedBy`): Der Seiten-Editor
//    speichert nur noch die eine Seite (PUT /api/pages) und sendet den Stempel
//    mit, auf dem seine Bearbeitung beruht. Hat inzwischen jemand anderes genau
//    diese Seite gespeichert, wird abgelehnt (409). Gleichzeitiges Arbeiten an
//    verschiedenen Seiten bleibt so konfliktfrei. Verschachtelte Seiten haben
//    keine eigene DB-Zeile (sie leben im `children`-JSON der Elternseite),
//    deshalb sitzt der Stempel im `data` des Knotens statt in einer Spalte.

export const PAGES_VERSION_HEADER = 'x-pages-version'

// Interne Metadaten in `data`, die beim Inhaltsvergleich nicht zählen.
const META_DATA_KEYS = ['_savedAt', '_savedBy', '_order']

export function computePagesVersion(rows) {
  let max = 0
  for (const r of rows || []) {
    const t = r && r.updatedAt ? new Date(r.updatedAt).getTime() : 0
    if (t > max) max = t
  }
  return `${(rows || []).length}-${max}`
}

// Serialisiert Schreibzugriffe auf Seiten innerhalb dieses Server-Prozesses,
// damit Versionsprüfung und Schreiben nicht von einer parallelen Anfrage
// unterbrochen werden (Temgine läuft als einzelner Node-Prozess).
// Aufruf: `const release = await acquirePagesLock(); try { … } finally { release() }`
let pagesLockTail = Promise.resolve()
export function acquirePagesLock() {
  let release
  const next = new Promise((resolve) => { release = resolve })
  const ready = pagesLockTail.then(() => release)
  pagesLockTail = pagesLockTail.then(() => next)
  return ready
}

function stableStringify(value) {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}

// Normalisiert Default-Werte, damit z. B. ein fehlendes `isHomepage` und
// `false` nicht als Änderung zählen.
function ownContentKey(node) {
  const n = node || {}
  const data = { ...(n.data || {}) }
  for (const k of META_DATA_KEYS) delete data[k]
  const out = {
    title: n.title || '',
    slug: n.slug || '',
    template: n.template || null,
    blocks: Array.isArray(n.blocks) ? n.blocks : [],
    data,
    status: n.status || 'DRAFT',
    publishAt: n.publishAt ? new Date(n.publishAt).toISOString() : null,
    isHomepage: Boolean(n.isHomepage),
    accessGroups: Array.isArray(n.accessGroups) ? n.accessGroups : [],
  }
  return stableStringify(out)
}

// Hat sich der eigene Inhalt einer Seite (ohne Unterseiten) geändert?
export function ownContentChanged(before, after) {
  return ownContentKey(before) !== ownContentKey(after)
}

// Hat sich eine Top-Level-Zeile inkl. Unterseiten geändert? (für Revisionen)
export function rowContentChanged(before, after) {
  const strip = (n) => {
    if (!n || typeof n !== 'object') return n
    const { accessPasswordHash, passwordProtected, newAccessPassword, clearAccessPassword, createdAt, updatedAt, ...rest } = n
    return { key: ownContentKey(rest), children: (rest.children || []).map(strip) }
  }
  return stableStringify(strip(before)) !== stableStringify(strip(after))
}

export function savedStamp(node) {
  const d = (node && node.data) || {}
  return { savedAt: d._savedAt || null, savedBy: d._savedBy || null }
}

export function stampNode(node, user) {
  node.data = {
    ...(node.data || {}),
    _savedAt: new Date().toISOString(),
    _savedBy: (user && (user.name || user.email)) || null,
  }
  return node
}

export function indexNodesById(rows) {
  const map = new Map()
  const walk = (list, topLevelId) => {
    for (const n of list || []) {
      if (!n) continue
      if (n.id) map.set(String(n.id), { node: n, topLevelId })
      walk(n.children, topLevelId)
    }
  }
  for (const r of rows || []) {
    if (!r) continue
    if (r.id) map.set(String(r.id), { node: r, topLevelId: String(r.id) })
    walk(r.children, String(r.id))
  }
  return map
}

// Bereitet einen vom Client gesendeten Baum vor dem Schreiben vor (mutiert ihn):
// - Knoten, deren eigener Inhalt sich geändert hat (oder die neu sind),
//   bekommen einen frischen Stempel — ein Editor, der genau diese Seite offen
//   hat, bemerkt die Änderung dann beim nächsten Speichern.
// - Unveränderte Knoten behalten den Stempel aus der DB.
// - Passwort-Hashes verschachtelter Seiten werden aus der DB übernommen, wenn
//   der Client sie nicht ausdrücklich ändert (GET liefert sie nie aus, ohne
//   diese Übernahme gingen sie bei jeder Baum-Speicherung verloren).
export function prepareTreeForWrite(incoming, dbRows, user) {
  const dbIndex = indexNodesById(dbRows)
  const walk = (list, isTopLevel) => {
    for (const n of list || []) {
      if (!n || typeof n !== 'object') continue
      const existing = n.id ? dbIndex.get(String(n.id)) : null
      const before = existing ? existing.node : null
      if (!before || ownContentChanged(before, n)) {
        stampNode(n, user)
      } else {
        const { savedAt, savedBy } = savedStamp(before)
        const data = { ...(n.data || {}) }
        if (savedAt) data._savedAt = savedAt; else delete data._savedAt
        if (savedBy) data._savedBy = savedBy; else delete data._savedBy
        n.data = data
      }
      if (!isTopLevel && before && n.accessPasswordHash === undefined && before.accessPasswordHash) {
        n.accessPasswordHash = before.accessPasswordHash
      }
      delete n.passwordProtected
      walk(n.children, false)
    }
  }
  walk(incoming, true)
  return incoming
}

// Ersetzt die eigenen Felder des Knotens `id` innerhalb eines children-Baums,
// lässt dessen Unterseiten unangetastet. Liefert den neuen Baum oder null,
// wenn der Knoten nicht gefunden wurde.
export function replaceNestedNode(children, id, apply) {
  let found = false
  const walk = (list) => (list || []).map((n) => {
    if (!n) return n
    if (n.id && String(n.id) === String(id)) {
      found = true
      return apply(n)
    }
    if (Array.isArray(n.children) && n.children.length) {
      return { ...n, children: walk(n.children) }
    }
    return n
  })
  const next = walk(children)
  return found ? next : null
}

export function findSiblings(rows, id) {
  for (const r of rows || []) {
    if (r && String(r.id) === String(id)) return rows
  }
  const search = (list) => {
    for (const n of list || []) {
      if (!n) continue
      const kids = n.children || []
      if (kids.some(c => c && String(c.id) === String(id))) return kids
      const deeper = search(kids)
      if (deeper) return deeper
    }
    return null
  }
  for (const r of rows || []) {
    const s = search(r && r.children)
    if (s) return s
  }
  return null
}
