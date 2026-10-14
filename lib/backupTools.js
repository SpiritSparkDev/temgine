// Zeitplan, Aufbewahrung und Trockenlauf-Validierung für Server-Backups (data/backups).
import fs from 'fs'
import path from 'path'

export const BACKUPS_DIR = path.join(process.cwd(), 'data', 'backups')
const SCHEDULE_FILE = path.join(process.cwd(), 'data', 'backup-schedule.json')
export const AUTO_PREFIX = 'temgine-auto-'
const INTERVAL_MS = { daily: 24 * 3600 * 1000, weekly: 7 * 24 * 3600 * 1000 }

export function readSchedule() {
  const def = { enabled: false, interval: 'daily', keep: 7, lastRunAt: null }
  try {
    return { ...def, ...JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8')) }
  } catch (_e) {
    return def
  }
}

export function writeSchedule(patch) {
  const cur = readSchedule()
  const next = { ...cur }
  if (patch.enabled !== undefined) next.enabled = Boolean(patch.enabled)
  if (patch.interval in INTERVAL_MS) next.interval = patch.interval
  if (patch.keep !== undefined) next.keep = Math.min(100, Math.max(1, parseInt(patch.keep, 10) || cur.keep))
  if (patch.lastRunAt !== undefined) next.lastRunAt = patch.lastRunAt
  fs.mkdirSync(path.dirname(SCHEDULE_FILE), { recursive: true })
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(next, null, 2), 'utf-8')
  return next
}

export function isDue(schedule, now = Date.now()) {
  if (!schedule.enabled) return false
  if (!schedule.lastRunAt) return true
  return now - new Date(schedule.lastRunAt).getTime() >= INTERVAL_MS[schedule.interval]
}

// Löscht nur automatische Backups über `keep` hinaus (älteste zuerst); manuelle bleiben.
export function applyRetention(keep, dir = BACKUPS_DIR) {
  let files
  try { files = fs.readdirSync(dir).filter((f) => f.startsWith(AUTO_PREFIX) && f.endsWith('.json')) } catch (_e) { return [] }
  files.sort().reverse() // Dateiname enthält Zeitstempel
  const doomed = files.slice(keep)
  doomed.forEach((f) => fs.unlinkSync(path.join(dir, f)))
  return doomed
}

// Trockenlauf: prüft Struktur und Referenzen, verändert nichts.
export function validateBackup(text) {
  const errors = []
  const warnings = []
  let b
  try { b = JSON.parse(text) } catch (e) { return { ok: false, errors: [`JSON nicht lesbar: ${e.message}`], warnings, counts: {} } }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, errors: ['Wurzel ist kein Objekt'], warnings, counts: {} }
  if (!b.metadata || typeof b.metadata !== 'object') errors.push('metadata fehlt')
  const listKeys = ['templates', 'snippets', 'pages', 'blogChannels', 'blogPosts', 'css', 'js', 'navigations', 'globalVariables', 'footers', 'uploadFonts', 'uploadedFiles']
  const counts = {}
  for (const k of listKeys) {
    if (b[k] === undefined) { warnings.push(`${k} fehlt`); continue }
    if (!Array.isArray(b[k])) { errors.push(`${k} ist keine Liste`); continue }
    counts[k] = b[k].length
  }
  const dup = (arr, field, label) => {
    const seen = new Set()
    for (const it of arr || []) {
      const v = it && it[field]
      if (v == null) continue
      if (seen.has(v)) errors.push(`${label}: doppelter ${field} "${v}"`)
      seen.add(v)
    }
  }
  if (Array.isArray(b.pages)) {
    dup(b.pages, 'id', 'Seiten')
    dup(b.pages, 'slug', 'Seiten')
  }
  if (Array.isArray(b.blogChannels) && Array.isArray(b.blogPosts)) {
    const ids = new Set(b.blogChannels.map((c) => c && c.id))
    b.blogPosts.forEach((p) => { if (p && !ids.has(p.channelId)) errors.push(`Blog-Beitrag "${p.slug || p.id}": Channel ${p.channelId} fehlt`) })
  }
  const filesIncluded = b.metadata && b.metadata.filesIncluded
  if (Array.isArray(filesIncluded) && filesIncluded.includes('uploadedFiles') && Array.isArray(b.uploadedFiles) && b.uploadedFiles.some((f) => !f || !f.path)) {
    errors.push('uploadedFiles: Eintrag ohne path')
  }
  return { ok: errors.length === 0, errors, warnings, counts, exportedAt: b.metadata && b.metadata.exportedAt }
}
