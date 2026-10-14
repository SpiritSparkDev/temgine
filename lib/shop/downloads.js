// Digitale Auslieferung (Spezifikation §7.5): Dateispeicher, Zugriffstoken je Bestellung und Datei.
import fs from 'fs'
import path from 'path'
import { prisma } from '../prisma'
import { randomToken } from './tokens'
import { logOrderEvent } from './events'
import { getNumberSetting } from './settingsStore'

export const MAX_FILE_BYTES = 200 * 1024 * 1024
const DAY_MS = 24 * 60 * 60 * 1000
// Steuer-, Zeilentrenner- und Bidi-Zeichen (per Codepoint gebaut, keine Sonderzeichen im Quelltext)
const UNSAFE_CHARS = new RegExp('[' + [[0, 31], [127, 159], [8232, 8233], [8234, 8238], [8294, 8297]].map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']', 'g')
const STORED_RE = /^[a-f0-9]{32}(\.[a-z0-9]{1,8})?$/

/** Speicherverzeichnis (absolut, außerhalb von public/); SHOP_DOWNLOAD_DIR überschreibt (Tests). */
export function downloadDir() {
  return path.resolve(process.env.SHOP_DOWNLOAD_DIR || path.join(process.cwd(), 'data', 'shop-downloads'))
}

export function ensureDownloadDir() {
  const dir = downloadDir()
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Nur Dateiname ohne Pfad, ohne Steuerzeichen, max. 120 Zeichen (Umlaute bleiben). */
export function sanitizeFilename(name) {
  const base = String(name ?? '').split(/[\\/]/).pop()
  const clean = base
    .replace(UNSAFE_CHARS, '')
    .trim()
    .slice(0, 120)
    .trim()
  return clean && clean !== '.' && clean !== '..' ? clean : 'datei'
}

/** Zufallsname im Speicher: 32 Hex-Zeichen + sichere Endung aus dem bereinigten Originalnamen. */
export function makeStoredName(originalName) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(sanitizeFilename(originalName))
  return randomToken(16) + (m ? `.${m[1].toLowerCase()}` : '')
}

/** Absoluter Pfad einer gespeicherten Datei oder null, wenn der Name nicht dem Schema entspricht / außerhalb liegt. */
export function resolveStoredPath(storedName) {
  if (typeof storedName !== 'string' || !STORED_RE.test(storedName)) return null
  const dir = downloadDir()
  const full = path.resolve(dir, storedName)
  return path.dirname(full) === dir ? full : null
}

/** Datei im Speicher entfernen; Fehler werden nur geloggt. */
export async function removeStoredFile(storedName) {
  const full = resolveStoredPath(storedName)
  if (!full) return
  try {
    await fs.promises.unlink(full)
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[shop/downloads] Datei nicht gelöscht:', e.message)
  }
}

const toLink = (t) => ({
  fileId: t.fileId,
  filename: t.file.filename,
  sizeBytes: t.file.sizeBytes,
  url: `/api/shop/download/${t.token}`,
  expiresAt: t.expiresAt,
  maxDownloads: t.maxDownloads,
})

/** Format-IDs mit digitalem Inhalt je Position (digitale Formate bzw. digitale Bündel-Bestandteile). */
function digitalFormatIds(items) {
  const ids = new Set()
  for (const it of items) {
    if (Array.isArray(it.bundleItems) && it.bundleItems.length) {
      for (const b of it.bundleItems) if (b && b.digital && b.formatId) ids.add(b.formatId)
    } else if (it.digital && it.formatId) {
      ids.add(it.formatId)
    }
  }
  return [...ids]
}

/** Erzeugt je (Bestellung, Datei) genau einen Token (idempotent) und liefert alle Links der Bestellung. */
export async function createDownloadTokens(order) {
  const items = await prisma.shopOrderItem.findMany({ where: { orderId: order.id } })
  const formatIds = digitalFormatIds(items)
  if (!formatIds.length) return []

  const files = await prisma.shopDigitalFile.findMany({ where: { formatId: { in: formatIds } }, orderBy: { createdAt: 'asc' } })
  const withFile = new Set(files.map((f) => f.formatId))
  const missing = formatIds.filter((id) => !withFile.has(id))
  if (missing.length) {
    await logOrderEvent(order.id, 'DOWNLOAD', `Hinweis: Für ${missing.length} digitale(s) Format(e) ist keine Datei hinterlegt`)
  }
  if (!files.length) return []

  const existing = await prisma.shopDownloadToken.findMany({ where: { orderId: order.id }, select: { fileId: true } })
  const have = new Set(existing.map((t) => t.fileId))
  const days = await getNumberSetting('shop_download_days', 30)
  const max = await getNumberSetting('shop_download_max', 5)
  const expiresAt = new Date(Date.now() + (days || 30) * DAY_MS)

  let created = 0
  for (const f of files) {
    if (have.has(f.id)) continue
    try {
      await prisma.shopDownloadToken.create({
        data: { orderId: order.id, fileId: f.id, token: randomToken(24), expiresAt, maxDownloads: max || 5 },
      })
      created++
    } catch (e) {
      if (e.code !== 'P2002') throw e // parallel angelegt: Unique (orderId, fileId)
    }
  }

  const tokens = await prisma.shopDownloadToken.findMany({
    where: { orderId: order.id, fileId: { in: files.map((f) => f.id) } },
    include: { file: true },
    orderBy: { createdAt: 'asc' },
  })
  if (created) await logOrderEvent(order.id, 'DOWNLOAD', `${created} Downloads freigegeben`)
  return tokens.map(toLink)
}

/** Links einer Bestellung inkl. Zählerstand (für Konto-/Statusseiten und Mails). */
export async function listDownloadsForOrder(orderId) {
  const tokens = await prisma.shopDownloadToken.findMany({ where: { orderId }, include: { file: true }, orderBy: { createdAt: 'asc' } })
  return tokens.map((t) => ({ ...toLink(t), downloads: t.downloads, remaining: Math.max(0, t.maxDownloads - t.downloads) }))
}

/** Zähler zurücksetzen und Ablauf neu setzen; liefert die Anzahl betroffener Tokens. */
export async function resetDownloads(orderId) {
  const days = await getNumberSetting('shop_download_days', 30)
  const r = await prisma.shopDownloadToken.updateMany({
    where: { orderId },
    data: { downloads: 0, expiresAt: new Date(Date.now() + (days || 30) * DAY_MS) },
  })
  return r.count
}
