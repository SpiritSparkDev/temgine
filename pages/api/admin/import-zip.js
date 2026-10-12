import JSZip from 'jszip'
import { requireAuth } from '../../../lib/auth'
import { runImport } from './import'

// Projekttransfer-ZIP direkt einspielen. Der Browser schickt die ZIP-Datei
// unverändert als Request-Body; der Server entpackt sie selbst und reicht die
// Upload-Dateien einzeln als Binärdaten an runImport() weiter.
// Vorher las der Browser jede Upload-Datei als Base64 in einen einzigen
// JSON-String – ab einigen hundert MB scheiterte das an der maximalen
// String-Länge von Browser bzw. Node ("Invalid string length").

export const config = {
  api: {
    bodyParser: false,
  },
}

// Obergrenze für die ZIP-Datei; Buffer (anders als Strings) vertragen das.
export const MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024

export function readRequestBody(req, limit = MAX_ZIP_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(Object.assign(new Error('ZIP-Datei ist zu groß'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks, size)))
    req.on('error', reject)
  })
}

// Wie readZipBackup in components/BackupView.js: Manifest-JSON (bevorzugt
// manifest/…), dazu uploads/ und uploads-fonts/ als Dateien – aber als
// Binärdaten, die erst beim Schreiben entpackt werden.
export async function readTransferZip(buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const jsonEntries = Object.keys(zip.files).filter((name) => name.toLowerCase().endsWith('.json'))
  const preferred = jsonEntries.find((name) => /manifest\//i.test(name)) || jsonEntries[0]
  if (!preferred) throw Object.assign(new Error('ZIP enthält keine JSON-Metadaten'), { status: 400 })

  let data
  try {
    data = JSON.parse(await zip.file(preferred).async('string'))
  } catch (e) {
    throw Object.assign(new Error(`Manifest ist kein gültiges JSON: ${e.message}`), { status: 400 })
  }
  if (data?.metadata?.exportType === 'static-site') {
    throw Object.assign(new Error('Static Site ZIPs können nicht importiert werden'), { status: 400 })
  }

  const uploadFonts = []
  const uploadedFiles = []
  for (const entry of Object.values(zip.files)) {
    if (!entry || entry.dir) continue
    const name = String(entry.name || '')
    const getBuffer = () => entry.async('nodebuffer')
    if (name.startsWith('uploads-fonts/')) uploadFonts.push({ path: name.slice('uploads-fonts/'.length), getBuffer })
    if (name.startsWith('uploads/')) uploadedFiles.push({ path: name.slice('uploads/'.length), getBuffer })
  }
  if (uploadFonts.length > 0) data.uploadFonts = uploadFonts
  if (uploadedFiles.length > 0) data.uploadedFiles = uploadedFiles
  return data
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).end()

    const auth = await requireAuth(req, res, ['ADMIN'])
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })

    const strategy = String(req.query.strategy || 'merge').toLowerCase()
    if (!['merge', 'replace'].includes(strategy)) {
      return res.status(400).json({ error: 'Invalid strategy. Use "merge" or "replace"' })
    }

    const buffer = await readRequestBody(req)
    if (buffer.length === 0) return res.status(400).json({ error: 'Keine ZIP-Datei empfangen' })

    const data = await readTransferZip(buffer)
    const result = await runImport(data, strategy)
    return res.status(200).json(result)
  } catch (e) {
    console.error('[/api/admin/import-zip] Error:', e.message, e.stack)
    return res.status(e.status || 500).json({ error: e.status ? e.message : 'Import failed', details: e.message })
  }
}
