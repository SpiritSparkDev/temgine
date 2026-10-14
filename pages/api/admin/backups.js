import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { requireAuth } from '../../../lib/auth'
import exportHandler from './export'
import { AUTO_PREFIX, applyRetention, readSchedule, writeSchedule, validateBackup } from '../../../lib/backupTools'

const BACKUPS_DIR = path.join(process.cwd(), 'data', 'backups')

// Server-Backup: ruft den JSON-Export prozessintern auf und legt das Ergebnis in data/backups ab.
let running = false
async function runBackup(req, prefix) {
  if (running) throw new Error('Es läuft bereits ein Backup')
  running = true
  try {
    let body = ''
    const fake = { method: 'GET', query: {}, headers: req.headers, __internalBackup: true }
    const out = { code: 200, headers: {}, setHeader(k, v) { out.headers[k] = v }, status(c) { out.code = c; return out }, send(b) { body = b; return out }, json(b) { body = JSON.stringify(b); return out }, end() { return out } }
    await exportHandler(fake, out)
    if (out.code !== 200) throw new Error(`Export fehlgeschlagen (${out.code}): ${body}`)
    ensureBackupsDir()
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    const filename = `${prefix}${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`
    fs.writeFileSync(path.join(BACKUPS_DIR, filename), body, 'utf-8')
    return filename
  } finally {
    running = false
  }
}

function isCronRequest(req) {
  const secret = process.env.BACKUP_CRON_SECRET
  const got = req.headers['x-backup-cron']
  if (!secret || typeof got !== 'string' || got.length !== secret.length) return false
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret))
}

// Ensure backups directory exists
function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true })
  }
}

// Get all backup files
function getBackupFiles() {
  ensureBackupsDir()
  try {
    const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.json'))
    return files
      .map(filename => {
        const filePath = path.join(BACKUPS_DIR, filename)
        try {
          const stats = fs.statSync(filePath)
          return {
            filename,
            size: stats.size,
            createdAt: stats.birthtime.toISOString(),
            modifiedAt: stats.mtime.toISOString()
          }
        } catch (e) {
          return null
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  } catch (e) {
    console.warn('Failed to read backups directory:', e.message)
    return []
  }
}

export default async function handler(req, res) {
  try {
    // Geplanter Lauf aus server.js: Secret statt Session (nur POST {action:'scheduled'}).
    if (req.method === 'POST' && req.body?.action === 'scheduled' && isCronRequest(req)) {
      const schedule = readSchedule()
      if (!schedule.enabled) return res.status(200).json({ ok: true, skipped: true })
      writeSchedule({ lastRunAt: new Date().toISOString() }) // vor dem Lauf: kein Doppelstart
      const filename = await runBackup(req, AUTO_PREFIX)
      applyRetention(schedule.keep)
      return res.status(200).json({ ok: true, filename })
    }

    const auth = await requireAuth(req, res, ['ADMIN'])
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })

    if (req.method === 'GET' && req.query.config) {
      return res.status(200).json({ ok: true, schedule: readSchedule() })
    }
    if (req.method === 'PUT') {
      return res.status(200).json({ ok: true, schedule: writeSchedule(req.body || {}) })
    }
    if (req.method === 'POST' && req.body?.action === 'run') {
      const filename = await runBackup(req, 'temgine-backup-')
      return res.status(200).json({ ok: true, filename })
    }
    if (req.method === 'POST' && req.body?.action === 'verify') {
      const filePath = path.join(BACKUPS_DIR, String(req.body.filename || ''))
      if (!path.resolve(filePath).startsWith(path.resolve(BACKUPS_DIR) + path.sep) || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Backup file not found' })
      }
      return res.status(200).json({ ok: true, report: validateBackup(fs.readFileSync(filePath, 'utf-8')) })
    }

    if (req.method === 'GET') {
      // Download a specific backup if filename is given, otherwise list all
      if (req.query.filename) {
        const filename = req.query.filename
        const filePath = path.join(BACKUPS_DIR, filename)

        // Prevent directory traversal
        if (!path.resolve(filePath).startsWith(path.resolve(BACKUPS_DIR))) {
          return res.status(400).json({ error: 'Invalid filename' })
        }

        try {
          if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Backup file not found' })
          }
          const content = fs.readFileSync(filePath, 'utf-8')
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
          return res.status(200).send(content)
        } catch (e) {
          console.error('Failed to read backup:', e.message)
          return res.status(500).json({ error: 'Backup konnte nicht gelesen werden', details: e.message })
        }
      }

      // List all backups
      const backups = getBackupFiles()
      return res.status(200).json({
        ok: true,
        backups,
        totalCount: backups.length,
        backupsDir: BACKUPS_DIR
      })
    }

    if (req.method === 'POST') {
      // Save a new backup from request body
      const { data, filename: proposedFilename } = req.body || {}
      if (!data) {
        return res.status(400).json({ error: 'No backup data provided' })
      }

      ensureBackupsDir()

      // Generate filename if not provided
      const now = new Date()
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
      const filename = proposedFilename || `temgine-backup-${dateStr}-${timeStr}.json`

      const filePath = path.join(BACKUPS_DIR, filename)

      // Prevent directory traversal
      if (!path.resolve(filePath).startsWith(path.resolve(BACKUPS_DIR))) {
        return res.status(400).json({ error: 'Invalid filename' })
      }

      try {
        const jsonData = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
        fs.writeFileSync(filePath, jsonData, 'utf-8')
        const stats = fs.statSync(filePath)

        return res.status(200).json({
          ok: true,
          backup: {
            filename,
            size: stats.size,
            createdAt: stats.birthtime.toISOString()
          }
        })
      } catch (e) {
        console.error('Failed to save backup:', e.message)
        return res.status(500).json({ error: 'Backup konnte nicht gespeichert werden', details: e.message })
      }
    }

    if (req.method === 'DELETE') {
      // Delete a backup file
      const { filename } = req.body || {}
      if (!filename) {
        return res.status(400).json({ error: 'Filename required' })
      }

      const filePath = path.join(BACKUPS_DIR, filename)

      // Prevent directory traversal
      if (!path.resolve(filePath).startsWith(path.resolve(BACKUPS_DIR))) {
        return res.status(400).json({ error: 'Invalid filename' })
      }

      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
          return res.status(200).json({ ok: true, message: `Backup "${filename}" deleted` })
        } else {
          return res.status(404).json({ error: 'Backup file not found' })
        }
      } catch (e) {
        console.error('Failed to delete backup:', e.message)
        return res.status(500).json({ error: 'Backup konnte nicht gelöscht werden', details: e.message })
      }
    }

    res.status(405).json({ error: 'Methode nicht erlaubt' })
  } catch (e) {
    console.error('[/api/admin/backups] Error:', e.message, e.stack)
    res.status(500).json({ error: 'Server error', details: e.message })
  }
}
