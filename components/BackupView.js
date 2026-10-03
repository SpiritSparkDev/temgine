import React, { useRef, useState, useEffect } from 'react'
import JSZip from 'jszip'
import { Download, Upload, Trash2, RefreshCw, AlertCircle, CheckCircle, Info, SlidersHorizontal, X } from '../lib/muiIcons'

// Fetch a response while reporting download progress (0-100) via Content-Length.
// Falls back to indeterminate (null) progress if the length is unknown.
async function fetchWithProgress(url, { onProgress } = {}) {
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(text || `Anfrage fehlgeschlagen (${res.status})`)
    err.status = res.status
    throw err
  }

  const total = parseInt(res.headers.get('content-length') || '0', 10)
  if (!res.body || !total) {
    if (onProgress) onProgress(null)
    const blob = await res.blob()
    return { blob, headers: res.headers }
  }

  const reader = res.body.getReader()
  const chunks = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (onProgress) onProgress(Math.min(99, Math.round((received / total) * 100)))
  }
  if (onProgress) onProgress(100)
  return { blob: new Blob(chunks), headers: res.headers }
}

// POST a body while reporting upload progress (0-100), then switch to
// indeterminate once the server starts processing the request.
function xhrRequest(url, { method = 'POST', headers = {}, body, onUploadProgress, onProcessing } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value))
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onUploadProgress) {
        onUploadProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.upload.onloadend = () => {
      if (onProcessing) onProcessing()
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText)
      } else {
        reject(Object.assign(new Error(xhr.responseText || `Anfrage fehlgeschlagen (${xhr.status})`), { status: xhr.status }))
      }
    }
    xhr.onerror = () => reject(new Error('Netzwerkfehler'))
    xhr.send(body)
  })
}

export default function BackupView({ onToast = () => {}, onConfirm = () => {} }) {
  const importInputRef = useRef(null)
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportScope, setExportScope] = useState('full')
  const [exportingZip, setExportingZip] = useState(false)
  const [exportingCss, setExportingCss] = useState(false)
  const [importing, setImporting] = useState(false)
  const [restoreStrategy, setRestoreStrategy] = useState('merge')
  const [backupSizeLimit, setBackupSizeLimit] = useState(5) // MB
  const [showSizeSettings, setShowSizeSettings] = useState(false)
  const [progressModal, setProgressModal] = useState(null) // { title, subtitle, percent, status: 'running'|'success'|'error' }

  const notify = (type, message) => {
    if (typeof onToast === 'function') onToast({ type, message })
  }

  // Auto-dismiss the progress popup shortly after a successful run
  useEffect(() => {
    if (progressModal?.status === 'success') {
      const t = setTimeout(() => setProgressModal(null), 1400)
      return () => clearTimeout(t)
    }
  }, [progressModal?.status])

  // Load settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('backupSizeLimit')
      if (saved) setBackupSizeLimit(parseInt(saved, 10))
    } catch (e) {}
    loadBackups()
  }, [])

  // Load list of backups
  const loadBackups = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/backups')
      if (res.ok) {
        const data = await res.json()
        setBackups(data.backups || [])
      } else {
        notify('error', 'Backups konnten nicht geladen werden')
      }
    } catch (e) {
      notify('error', `Fehler beim Laden: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  // Export project transfer ZIP
  const scopeLabels = {
    full: 'Vollständig',
    'db-templates': 'Datenbank + Templates',
    db: 'Nur Datenbank',
  }
  const handleExport = async () => {
    setExporting(true)
    setProgressModal({ title: 'Backup wird erstellt', subtitle: `Projekttransfer-ZIP · ${scopeLabels[exportScope]}`, percent: null, status: 'running' })
    try {
      const { blob, headers } = await fetchWithProgress(`/api/admin/export?format=transfer-zip&scope=${exportScope}`, {
        onProgress: (percent) => setProgressModal(m => m && { ...m, percent })
      })
      const fileSize = blob.size
      const sizeMB = fileSize / (1024 * 1024)

      // Check size limit and warn if exceeded
      if (sizeMB > backupSizeLimit) {
        notify('warning', `Backup ist ${sizeMB.toFixed(2)}MB groß (Limit: ${backupSizeLimit}MB). Download wird trotzdem durchgeführt.`)
      }

      // Get filename from Content-Disposition header if available
      let filename = 'temgine-project-transfer.zip'
      const disposition = headers.get('content-disposition')
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/)
        if (match) filename = match[1]
      }

      downloadBlob(blob, filename)

      setProgressModal(m => m && { ...m, percent: 100, status: 'success', subtitle: `Fertig – ${sizeMB.toFixed(2)}MB` })
      notify('success', `Projekttransfer exportiert (${sizeMB.toFixed(2)}MB)`)

      // Refresh backup list
      loadBackups()
    } catch (e) {
      setProgressModal(m => m && { ...m, status: 'error', message: e.message })
      notify('error', `Export fehlgeschlagen: ${e.message}`)
    } finally {
      setExporting(false)
    }
  }

  // Export static website as ZIP
  const handleExportZip = async () => {
    setExportingZip(true)
    try {
      const res = await fetch('/api/admin/export?format=static-site')
      if (!res.ok) {
        const errorText = await res.text().catch(() => '')
        console.error('[backup-view] static export failed', {
          status: res.status,
          contentType: res.headers.get('content-type'),
          body: errorText,
        })
        throw new Error(errorText || `ZIP-Export fehlgeschlagen (${res.status})`)
      }

      let filename = 'temgine-static-site.zip'
      const disposition = res.headers.get('content-disposition')
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/)
        if (match) filename = match[1]
      }

      const blob = await res.blob()
      downloadBlob(blob, filename)

      notify('success', 'Statische Website exportiert (HTML, Bilder, Fonts und CSS)')
    } catch (e) {
      console.error('[backup-view] static export error', e)
      notify('error', `ZIP Export fehlgeschlagen: ${e.message}`)
    } finally {
      setExportingZip(false)
    }
  }

  const handleExportCss = async () => {
    setExportingCss(true)
    try {
      const res = await fetch('/api/admin/export?format=css')
      if (!res.ok) throw new Error('Fehlgeschlagen')

      let filename = 'temgine-styles.css'
      const disposition = res.headers.get('content-disposition')
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/)
        if (match) filename = match[1]
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)

      notify('success', 'CSS exportiert (alle aktivierten Dateien zusammengeführt)')
    } catch (e) {
      notify('error', `CSS Export fehlgeschlagen: ${e.message}`)
    } finally {
      setExportingCss(false)
    }
  }

  // Import backup from file
  const readZipBackup = async (file) => {
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const jsonEntries = Object.keys(zip.files).filter(name => name.toLowerCase().endsWith('.json'))
    const preferred = jsonEntries.find(name => /manifest\//i.test(name)) || jsonEntries[0]
    if (!preferred) throw new Error('ZIP enthält keine JSON-Metadaten')
    const content = await zip.file(preferred).async('string')
    const data = JSON.parse(content)
    if (data?.metadata?.exportType === 'static-site') {
      throw new Error('Static Site ZIPs können nicht importiert werden')
    }

    const entries = Object.values(zip.files)
    const uploadFiles = []
    const uploadFonts = []

    for (const entry of entries) {
      if (!entry || entry.dir) continue
      const name = String(entry.name || '')
      if (name.startsWith('uploads-fonts/')) {
        const relPath = name.replace(/^uploads-fonts\//, '')
        const fileContent = await entry.async('base64')
        uploadFonts.push({ path: relPath, encoding: 'base64', content: fileContent })
      }
      if (name.startsWith('uploads/')) {
        const relPath = name.replace(/^uploads\//, '')
        const fileContent = await entry.async('base64')
        uploadFiles.push({ path: relPath, encoding: 'base64', content: fileContent })
      }
    }

    if (uploadFonts.length > 0) {
      data.uploadFonts = uploadFonts
    }
    if (uploadFiles.length > 0) {
      data.uploadedFiles = uploadFiles
    }

    return data
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      const data = file.name.toLowerCase().endsWith('.zip')
        ? await readZipBackup(file)
        : JSON.parse(await file.text())

      // Show confirmation dialog
      const itemCounts = data.metadata?.itemCounts || {
        templates: data.templates?.length || 0,
        snippets: data.snippets?.length || 0,
        pages: data.pages?.length || 0,
        cssFiles: data.css?.length || 0,
        navigations: data.navigations?.length || 0,
        globalVariables: data.globalVariables?.length || 0,
        footers: data.footers?.length || 0,
        uploadedFiles: data.uploadedFiles?.length || 0,
        cssConfig: data.cssConfig ? 1 : 0,
        fontsConfig: data.fontsConfig ? 1 : 0
      }

      const scopeLabel = { full: 'Vollständig', 'db-templates': 'Datenbank + Templates', db: 'Nur Datenbank' }[data.metadata?.scope] || null
      const filesIncluded = Array.isArray(data.metadata?.filesIncluded) ? data.metadata.filesIncluded : null

      const message = `${restoreStrategy === 'merge' ? 'Merge' : 'Ersetzen'}${scopeLabel ? ` - Umfang dieses Backups: ${scopeLabel}` : ''} - Werden importiert:\n
• ${itemCounts.templates} Templates
• ${itemCounts.snippets} Snippets
• ${itemCounts.pages} Seiten
• ${itemCounts.cssFiles} CSS-Dateien
• ${itemCounts.navigations} Navigationen
• ${itemCounts.globalVariables} Globale Variablen
• ${itemCounts.footers} Footer
• ${itemCounts.uploadedFiles} Upload-Dateien
• CSS-Aktivierungsstatus: ${itemCounts.cssConfig ? 'enthalten' : 'nicht enthalten'}
• Font-Aktivierungsstatus: ${itemCounts.fontsConfig ? 'enthalten' : 'nicht enthalten'}

${restoreStrategy === 'replace' ? (
  filesIncluded
    ? `⚠️ WARNUNG: Bestehende Daten werden für die in diesem Backup enthaltenen Kategorien gelöscht und ersetzt (siehe Liste oben). Kategorien, die in diesem Backup fehlen (z. B. Uploads bei einem reinen Datenbank-Backup), bleiben unangetastet.`
    : `⚠️ WARNUNG: Alle bestehenden Daten werden gelöscht!`
) : ''}`

      onConfirm({
        title: 'Projekttransfer importieren?',
        message,
        onConfirm: async () => {
          setProgressModal({
            title: 'Backup wird eingespielt',
            subtitle: restoreStrategy === 'merge' ? 'Merge-Strategie' : 'Ersetzen-Strategie',
            percent: 0,
            status: 'running'
          })
          try {
            const responseText = await xhrRequest(`/api/admin/import?strategy=${restoreStrategy}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
              onUploadProgress: (percent) => setProgressModal(m => m && { ...m, percent }),
              onProcessing: () => setProgressModal(m => m && { ...m, percent: null, subtitle: 'Wird verarbeitet…' })
            })

            const result = JSON.parse(responseText)
            setProgressModal(m => m && { ...m, percent: 100, status: 'success', subtitle: 'Import abgeschlossen' })
            notify('success', `Import erfolgreich: ${result.importStats.templates} Templates, ${result.importStats.snippets} Snippets, ${result.importStats.pages} Seiten`)
            await loadBackups()
          } catch (err) {
            let message = err.message
            try { message = JSON.parse(err.message).error || message } catch (e) {}
            setProgressModal(m => m && { ...m, status: 'error', message })
            notify('error', `Import fehlgeschlagen: ${message}`)
          }
        }
      })
    } catch (err) {
      notify('error', `Datei-Fehler: ${err.message}`)
    } finally {
      setImporting(false)
      e.target.value = '' // Reset input
    }
  }

  // Delete a backup
  const handleDeleteBackup = (backup) => {
    onConfirm({
      title: 'Backup löschen?',
      message: `${backup.filename} wird gelöscht.`,
      onConfirm: async () => {
        try {
          const res = await fetch('/api/admin/backups', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: backup.filename })
          })

          if (!res.ok) throw new Error('Löschen fehlgeschlagen')

          notify('success', 'Backup gelöscht')
          loadBackups()
        } catch (e) {
          notify('error', `Fehler: ${e.message}`)
        }
      }
    })
  }

  // Download a backup
  const handleDownloadBackup = async (backup) => {
    try {
      const res = await fetch(`/api/admin/backups?filename=${encodeURIComponent(backup.filename)}`)
      if (!res.ok) throw new Error('Herunterladen fehlgeschlagen')

      const content = await res.text()
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = backup.filename
      link.click()
      URL.revokeObjectURL(url)

      notify('success', 'Backup heruntergeladen')
    } catch (e) {
      notify('error', `Download fehlgeschlagen: ${e.message}`)
    }
  }

  // Save size limit
  const saveSizeLimit = () => {
    try {
      localStorage.setItem('backupSizeLimit', String(backupSizeLimit))
      notify('success', `Größenlimit auf ${backupSizeLimit}MB gesetzt`)
      setShowSizeSettings(false)
    } catch (e) {
      notify('error', 'Fehler beim Speichern')
    }
  }

  const openImportDialog = () => {
    if (importing) return
    if (importInputRef.current) {
      importInputRef.current.click()
    }
  }

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('de-DE') + ' ' + date.toLocaleTimeString('de-DE')
    } catch (e) {
      return dateStr
    }
  }

  return (
    <div className="backup-view">
      <style>{`
        .backup-view {
          --surface: #ffffff;
          --surface-muted: #f4f6f8;
          --ink: #1b1d22;
          --ink-soft: #6e7683;
          --line: #d8dde6;
          --brand: #0d6efd;
          --brand-strong: #0a58ca;
          --danger: #d32f2f;
          --shadow: 0 12px 30px rgba(10, 16, 28, 0.08);
          padding: 24px;
          max-width: 980px;
          margin: 0 auto;
          color: var(--ink);
        }

        .dark-mode .backup-view {
          --surface: #17191f;
          --surface-muted: #22262f;
          --ink: #e8ebf2;
          --ink-soft: #aeb6c4;
          --line: #343b48;
          --brand: #5aa0ff;
          --brand-strong: #7ab3ff;
          --danger: #ff6b6b;
          --shadow: 0 16px 36px rgba(0, 0, 0, 0.32);
        }

        .backup-hero {
          background: linear-gradient(135deg, rgba(13, 110, 253, 0.12), rgba(13, 110, 253, 0.02));
          border: 1px solid rgba(13, 110, 253, 0.24);
          border-radius: 14px;
          padding: 18px 20px;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .dark-mode .backup-hero {
          background: linear-gradient(135deg, rgba(90, 160, 255, 0.22), rgba(90, 160, 255, 0.05));
          border-color: rgba(122, 179, 255, 0.35);
        }

        .backup-title {
          font-size: 22px;
          line-height: 1.2;
          margin: 0;
          letter-spacing: 0.01em;
        }

        .backup-subtitle {
          margin: 4px 0 0;
          font-size: 13px;
          color: var(--ink-soft);
        }

        .backup-chip {
          font-size: 12px;
          font-weight: 700;
          color: var(--brand-strong);
          background: rgba(13, 110, 253, 0.12);
          border: 1px solid rgba(13, 110, 253, 0.28);
          border-radius: 999px;
          padding: 6px 10px;
          white-space: nowrap;
        }

        .backup-section {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 16px;
          box-shadow: var(--shadow);
        }

        .backup-section h3 {
          margin-top: 0;
          margin-bottom: 14px;
          font-size: 17px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .backup-section-icon {
          width: 20px;
          height: 20px;
          color: var(--primary-color, #007bff);
        }

        .backup-buttons {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }

        .backup-btn {
          padding: 10px 14px;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: var(--surface-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.18s ease;
          color: inherit;
        }

        .backup-btn:hover {
          transform: translateY(-1px);
          background: var(--brand);
          color: #fff;
          border-color: var(--brand);
        }

        .backup-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }

        .backup-btn-primary {
          background: var(--brand);
          border-color: var(--brand);
          color: #fff;
        }

        .backup-btn-primary:hover {
          background: var(--brand-strong);
          border-color: var(--brand-strong);
        }

        .backup-btn-danger {
          color: var(--danger);
        }

        .backup-btn-danger:hover {
          background: var(--danger);
          color: white;
          border-color: var(--danger);
        }

        .backup-info {
          background: rgba(13, 110, 253, 0.08);
          border: 1px solid rgba(13, 110, 253, 0.22);
          border-left: 4px solid var(--brand);
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 14px;
          font-size: 14px;
          line-height: 1.5;
          color: inherit;
        }

        .backup-warning {
          background: #fff6dc;
          border-left: 4px solid #ffc107;
          border: 1px solid #f3de94;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 14px;
          font-size: 14px;
          line-height: 1.5;
          color: #856404;
        }

        .dark-mode .backup-warning {
          background: #664d03;
          color: #ffc107;
        }

        .strategy-selector {
          display: flex;
          gap: 12px;
          margin: 15px 0;
          flex-wrap: wrap;
        }

        .radio-option {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          background: var(--surface-muted);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 10px 12px;
        }

        .radio-option input[type="radio"] {
          cursor: pointer;
        }

        .radio-option label {
          cursor: pointer;
          margin: 0;
        }

        .size-settings {
          background: var(--surface-muted);
          border: 1px solid var(--line);
          padding: 12px;
          border-radius: 10px;
          margin-bottom: 15px;
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .size-settings input {
          width: 80px;
          padding: 6px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: var(--surface);
          color: inherit;
        }

        .size-settings label {
          font-size: 14px;
        }

        .file-input-wrapper {
          position: relative;
          overflow: hidden;
          display: inline-block;
        }

        .file-input-wrapper input[type="file"] {
          position: absolute;
          left: -9999px;
        }

        .backup-list {
          margin-top: 15px;
          display: grid;
          gap: 10px;
        }

        .backup-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 14px;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: var(--surface-muted);
          transition: all 0.18s ease;
        }

        .backup-item:hover {
          border-color: var(--brand);
          transform: translateY(-1px);
        }

        .backup-item-info {
          flex: 1;
          min-width: 0;
        }

        .backup-item-name {
          font-weight: 600;
          font-size: 14px;
          word-break: break-all;
        }

        .backup-item-meta {
          font-size: 12px;
          color: var(--ink-soft);
          margin-top: 4px;
        }

        .backup-item-actions {
          display: flex;
          gap: 8px;
          margin-left: 12px;
          flex-shrink: 0;
        }

        .backup-item-btn {
          padding: 6px 10px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: var(--surface);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.18s ease;
          color: inherit;
        }

        .backup-item-btn:hover {
          background: var(--brand);
          color: white;
          border-color: var(--brand);
        }

        .backup-item-btn-danger:hover {
          background: var(--danger);
          border-color: var(--danger);
        }

        .backup-empty {
          padding: 20px;
          text-align: center;
          color: var(--ink-soft);
          border: 2px dashed var(--line);
          border-radius: 10px;
          background: var(--surface-muted);
        }

        .spinner {
          display: inline-block;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .progress-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .progress-modal {
          background: var(--surface);
          color: var(--ink);
          border-radius: 14px;
          border: 1px solid var(--line);
          box-shadow: var(--shadow);
          padding: 22px 24px;
          width: 100%;
          max-width: 420px;
          margin: 16px;
        }

        .progress-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 4px;
        }

        .progress-modal-title {
          font-size: 16px;
          font-weight: 700;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .progress-modal-close {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--ink-soft);
          padding: 4px;
          border-radius: 6px;
          display: flex;
        }

        .progress-modal-close:hover {
          background: var(--surface-muted);
          color: var(--ink);
        }

        .progress-modal-subtitle {
          font-size: 13px;
          color: var(--ink-soft);
          margin: 0 0 16px;
          word-break: break-word;
        }

        .progress-bar-track {
          width: 100%;
          height: 10px;
          border-radius: 999px;
          background: var(--surface-muted);
          border: 1px solid var(--line);
          overflow: hidden;
        }

        .progress-bar-fill {
          height: 100%;
          border-radius: 999px;
          background: var(--brand);
          transition: width 0.25s ease;
        }

        .progress-modal.is-error .progress-bar-fill {
          background: var(--danger);
        }

        .progress-modal.is-success .progress-bar-fill {
          background: #2e9e5b;
        }

        .progress-bar-track.is-indeterminate .progress-bar-fill {
          width: 40% !important;
          animation: progress-indeterminate 1.1s ease-in-out infinite;
        }

        @keyframes progress-indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }

        .progress-modal-percent {
          margin-top: 10px;
          font-size: 12px;
          color: var(--ink-soft);
          display: flex;
          justify-content: space-between;
        }

        @media (max-width: 768px) {
          .backup-view {
            padding: 14px;
          }

          .backup-hero {
            padding: 14px;
            flex-direction: column;
            align-items: flex-start;
          }

          .backup-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
          }

          .backup-item-actions {
            margin-left: 0;
            width: 100%;
          }

          .backup-item-btn {
            flex: 1;
            justify-content: center;
          }

          .backup-btn {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>

      <div className="backup-hero">
        <div>
          <h2 className="backup-title">Projekttransfer & Static Export</h2>
            <p className="backup-subtitle">Transferiere Projekte zwischen Temgine-Instanzen oder exportiere die öffentliche Website als statische Ausgabe.</p>
        </div>
          <span className="backup-chip">Exportzentrale</span>
      </div>

      {/* Export Section */}
      <div className="backup-section">
        <h3><Download className="backup-section-icon" /> Projekttransfer</h3>
        <div className="backup-info">
          <Info size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'text-top' }} />
          Exportiert ein übertragbares ZIP für die nächste Temgine-Instanz. Wähle den Umfang:
        </div>

        <div className="strategy-selector">
          <div className="radio-option">
            <input
              type="radio"
              id="scope-full"
              name="exportScope"
              value="full"
              checked={exportScope === 'full'}
              onChange={(e) => setExportScope(e.target.value)}
            />
            <label htmlFor="scope-full">
              <strong>Vollständig</strong> - Datenbank, Templates, Navigationen, Footer, CSS, Uploads & Schriftarten
            </label>
          </div>
          <div className="radio-option">
            <input
              type="radio"
              id="scope-db-templates"
              name="exportScope"
              value="db-templates"
              checked={exportScope === 'db-templates'}
              onChange={(e) => setExportScope(e.target.value)}
            />
            <label htmlFor="scope-db-templates">
              <strong>Datenbank + Templates</strong> - zusätzlich Navigationen, Footer, Wartungsseiten & CSS, ohne Uploads
            </label>
          </div>
          <div className="radio-option">
            <input
              type="radio"
              id="scope-db"
              name="exportScope"
              value="db"
              checked={exportScope === 'db'}
              onChange={(e) => setExportScope(e.target.value)}
            />
            <label htmlFor="scope-db">
              <strong>Nur Datenbank</strong> - Seiten, Snippets & Globale Variablen, ohne Templates, Uploads & Assets
            </label>
          </div>
        </div>

        <div className="backup-buttons">
          <button className="backup-btn backup-btn-primary" onClick={handleExport} disabled={exporting || exportingZip}>
            {exporting ? (
              <><RefreshCw size={16} className="spinner" /> Wird exportiert...</>
            ) : (
              <><Download size={16} /> Projekttransfer-ZIP</>
            )}
          </button>
          <button className="backup-btn" onClick={handleExportZip} disabled={exporting || exportingZip || exportingCss}>
            {exportingZip ? (
              <><RefreshCw size={16} className="spinner" /> Export läuft...</>
            ) : (
              <><Download size={16} /> Static Site ZIP</>
            )}
          </button>
          <button className="backup-btn" onClick={handleExportCss} disabled={exporting || exportingZip || exportingCss}>
            {exportingCss ? (
              <><RefreshCw size={16} className="spinner" /> CSS wird exportiert...</>
            ) : (
              <><Download size={16} /> CSS exportieren</>
            )}
          </button>
          <button className="backup-btn" onClick={() => setShowSizeSettings(!showSizeSettings)}>
            <SlidersHorizontal size={16} /> Größenlimit
          </button>
        </div>

        {showSizeSettings && (
          <div className="size-settings">
            <label>Warnung ab:</label>
            <input
              type="number"
              min="1"
              max="100"
              value={backupSizeLimit}
              onChange={(e) => setBackupSizeLimit(parseInt(e.target.value, 10) || 5)}
            />
            <span>MB</span>
            <button className="backup-btn" onClick={saveSizeLimit}>
              Speichern
            </button>
          </div>
        )}
      </div>

      {/* Import Section */}
      <div className="backup-section">
        <h3><Upload className="backup-section-icon" /> Import / Restore</h3>
        <div className="backup-info">
          Lade einen Projekttransfer oder ein altes Backup. Wähle die Restore-Strategie:
        </div>

        <div className="strategy-selector">
          <div className="radio-option">
            <input
              type="radio"
              id="merge"
              name="strategy"
              value="merge"
              checked={restoreStrategy === 'merge'}
              onChange={(e) => setRestoreStrategy(e.target.value)}
            />
            <label htmlFor="merge">
              <strong>Merge</strong> - Neue Einträge hinzufügen, Bestehende behalten
            </label>
          </div>
          <div className="radio-option">
            <input
              type="radio"
              id="replace"
              name="strategy"
              value="replace"
              checked={restoreStrategy === 'replace'}
              onChange={(e) => setRestoreStrategy(e.target.value)}
            />
            <label htmlFor="replace">
              <strong>Ersetzen</strong> - Alle Daten überschreiben
            </label>
          </div>
        </div>

        {restoreStrategy === 'replace' && (
          <div className="backup-warning">
            <AlertCircle size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'text-top' }} />
            <strong>WARNUNG:</strong> Die "Ersetzen"-Strategie wird alle bestehenden Templates, Snippets, Seiten, CSS-Dateien, Navigationen und Aktivierungskonfigurationen löschen!
          </div>
        )}

        <div className="file-input-wrapper">
          <button className="backup-btn backup-btn-primary" disabled={importing} onClick={openImportDialog} type="button">
            {importing ? (
              <>
                <RefreshCw size={16} className="spinner" /> Wird importiert...
              </>
            ) : (
              <>
                <Upload size={16} /> ZIP oder JSON auswählen
              </>
            )}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.zip"
            onChange={handleImport}
            disabled={importing}
          />
        </div>
      </div>

      {/* Backups List Section */}
      <div className="backup-section">
        <h3><CheckCircle className="backup-section-icon" /> Gespeicherte Backups</h3>
        <div className="backup-buttons">
          <button className="backup-btn" onClick={loadBackups} disabled={loading}>
            {loading ? (
              <>
                <RefreshCw size={16} className="spinner" /> Wird geladen...
              </>
            ) : (
              <>
                <RefreshCw size={16} /> Aktualisieren
              </>
            )}
          </button>
        </div>

        {backups.length === 0 ? (
          <div className="backup-empty">
            Keine Backups vorhanden. Erstelle den ersten Projekttransfer mit dem Export-Button oben.
          </div>
        ) : (
          <div className="backup-list">
            {backups.map((backup) => (
              <div key={backup.filename} className="backup-item">
                <div className="backup-item-info">
                  <div className="backup-item-name">{backup.filename}</div>
                  <div className="backup-item-meta">
                    {formatBytes(backup.size)} · {formatDate(backup.createdAt)}
                  </div>
                </div>
                <div className="backup-item-actions">
                  <button
                    className="backup-item-btn"
                    onClick={() => handleDownloadBackup(backup)}
                    title="Download"
                  >
                    <Download size={14} /> Download
                  </button>
                  <button
                    className="backup-item-btn backup-item-btn-danger"
                    onClick={() => handleDeleteBackup(backup)}
                    title="Löschen"
                  >
                    <Trash2 size={14} /> Löschen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {progressModal && (
        <div className="progress-overlay" onClick={() => { if (progressModal.status !== 'running') setProgressModal(null) }}>
          <div
            className={`progress-modal ${progressModal.status === 'error' ? 'is-error' : ''} ${progressModal.status === 'success' ? 'is-success' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="progress-modal-header">
              <h3 className="progress-modal-title">
                {progressModal.status === 'error' ? (
                  <AlertCircle size={18} />
                ) : progressModal.status === 'success' ? (
                  <CheckCircle size={18} />
                ) : (
                  <RefreshCw size={18} className="spinner" />
                )}
                {progressModal.title}
              </h3>
              {progressModal.status !== 'running' && (
                <button className="progress-modal-close" onClick={() => setProgressModal(null)} title="Schließen">
                  <X size={18} />
                </button>
              )}
            </div>
            <p className="progress-modal-subtitle">
              {progressModal.status === 'error' ? (progressModal.message || 'Fehler') : progressModal.subtitle}
            </p>
            <div className={`progress-bar-track ${progressModal.percent == null ? 'is-indeterminate' : ''}`}>
              <div
                className="progress-bar-fill"
                style={progressModal.percent == null ? undefined : { width: `${progressModal.percent}%` }}
              />
            </div>
            {progressModal.percent != null && (
              <div className="progress-modal-percent">
                <span>{progressModal.status === 'error' ? 'Abgebrochen' : `${progressModal.percent}%`}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
