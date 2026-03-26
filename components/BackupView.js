import React, { useRef, useState, useEffect } from 'react'
import { Download, Upload, Trash2, RefreshCw, AlertCircle, CheckCircle, Info } from 'lucide-react'

export default function BackupView({ onToast = () => {}, onConfirm = () => {} }) {
  const importInputRef = useRef(null)
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [restoreStrategy, setRestoreStrategy] = useState('merge')
  const [backupSizeLimit, setBackupSizeLimit] = useState(5) // MB
  const [showSizeSettings, setShowSizeSettings] = useState(false)

  const notify = (type, message) => {
    if (typeof onToast === 'function') onToast({ type, message })
  }

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

  // Export backup
  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/admin/export')
      if (!res.ok) throw new Error('Export failed')

      const json = await res.text()
      const fileSize = new Blob([json]).size
      const sizeMB = fileSize / (1024 * 1024)

      // Check size limit and warn if exceeded
      if (sizeMB > backupSizeLimit) {
        notify('warning', `Backup ist ${sizeMB.toFixed(2)}MB groß (Limit: ${backupSizeLimit}MB). Download wird trotzdem durchgeführt.`)
      }

      // Get filename from Content-Disposition header if available
      let filename = 'temphelix-backup.json'
      const disposition = res.headers.get('content-disposition')
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/)
        if (match) filename = match[1]
      }

      // Download file
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)

      notify('success', `Backup exportiert (${sizeMB.toFixed(2)}MB)`)
      
      // Refresh backup list
      loadBackups()
    } catch (e) {
      notify('error', `Export fehlgeschlagen: ${e.message}`)
    } finally {
      setExporting(false)
    }
  }

  // Import backup from file
  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const content = event.target?.result
        if (!content) throw new Error('File is empty')

        const data = JSON.parse(content)

        // Show confirmation dialog
        const itemCounts = data.metadata?.itemCounts || {
          templates: data.templates?.length || 0,
          snippets: data.snippets?.length || 0,
          pages: data.pages?.length || 0,
          cssFiles: data.css?.length || 0,
          navigations: data.navigations?.length || 0
        }

        const message = `${restoreStrategy === 'merge' ? 'Merge' : 'Ersetzen'} - Werden importiert:\n
• ${itemCounts.templates} Templates
• ${itemCounts.snippets} Snippets
• ${itemCounts.pages} Seiten
• ${itemCounts.cssFiles} CSS-Dateien
• ${itemCounts.navigations} Navigationen

${restoreStrategy === 'replace' ? '⚠️ WARNUNG: Alle bestehenden Daten werden gelöscht!' : ''}`

        onConfirm({
          title: 'Backup importieren?',
          message,
          onConfirm: async () => {
            try {
              const res = await fetch(`/api/admin/import?strategy=${restoreStrategy}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              })

              if (!res.ok) {
                const error = await res.json()
                throw new Error(error.error || 'Import failed')
              }

              const result = await res.json()
              notify('success', `Import erfolgreich: ${result.importStats.templates} Templates, ${result.importStats.snippets} Snippets, ${result.importStats.pages} Seiten`)
              await loadBackups()
            } catch (err) {
              notify('error', `Import fehlgeschlagen: ${err.message}`)
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
    reader.readAsText(file)
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

          if (!res.ok) throw new Error('Failed to delete backup')

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
      if (!res.ok) throw new Error('Download failed')

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
          padding: 20px;
          max-width: 900px;
          margin: 0 auto;
        }

        .backup-section {
          background: var(--background-secondary, #f5f5f5);
          border: 1px solid var(--border-color, #ddd);
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
        }

        .dark-mode .backup-section {
          background: #2a2a2a;
          border-color: #444;
        }

        .backup-section h3 {
          margin-top: 0;
          margin-bottom: 15px;
          font-size: 16px;
          font-weight: 600;
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
          margin-bottom: 10px;
        }

        .backup-btn {
          padding: 10px 16px;
          border: 1px solid var(--border-color, #ddd);
          border-radius: 6px;
          background: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .dark-mode .backup-btn {
          background: #333;
          border-color: #555;
          color: #eee;
        }

        .backup-btn:hover {
          background: var(--primary-color, #007bff);
          color: white;
          border-color: var(--primary-color, #007bff);
        }

        .backup-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .backup-btn-danger {
          color: #d32f2f;
        }

        .backup-btn-danger:hover {
          background: #d32f2f;
          color: white;
        }

        .backup-info {
          background: #e3f2fd;
          border-left: 4px solid #2196f3;
          padding: 12px;
          border-radius: 4px;
          margin-bottom: 15px;
          font-size: 14px;
          line-height: 1.5;
        }

        .dark-mode .backup-info {
          background: #1e3a5f;
          border-left-color: #64b5f6;
        }

        .backup-warning {
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 12px;
          border-radius: 4px;
          margin-bottom: 15px;
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
          gap: 20px;
          margin: 15px 0;
          flex-wrap: wrap;
        }

        .radio-option {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .radio-option input[type="radio"] {
          cursor: pointer;
        }

        .radio-option label {
          cursor: pointer;
          margin: 0;
        }

        .size-settings {
          background: var(--background-tertiary, #f9f9f9);
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 15px;
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .dark-mode .size-settings {
          background: #333;
        }

        .size-settings input {
          width: 80px;
          padding: 6px;
          border: 1px solid var(--border-color, #ddd);
          border-radius: 4px;
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
        }

        .backup-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border: 1px solid var(--border-color, #ddd);
          border-radius: 6px;
          margin-bottom: 8px;
          background: white;
          transition: all 0.2s;
        }

        .dark-mode .backup-item {
          background: #1a1a1a;
          border-color: #555;
        }

        .backup-item:hover {
          border-color: var(--primary-color, #007bff);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .dark-mode .backup-item:hover {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .backup-item-info {
          flex: 1;
        }

        .backup-item-name {
          font-weight: 500;
          font-size: 14px;
          word-break: break-all;
        }

        .backup-item-meta {
          font-size: 12px;
          color: #666;
          margin-top: 4px;
        }

        .dark-mode .backup-item-meta {
          color: #999;
        }

        .backup-item-actions {
          display: flex;
          gap: 8px;
          margin-left: 12px;
        }

        .backup-item-btn {
          padding: 6px 10px;
          border: 1px solid var(--border-color, #ddd);
          border-radius: 4px;
          background: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          transition: all 0.2s;
        }

        .dark-mode .backup-item-btn {
          background: #333;
          border-color: #555;
          color: #eee;
        }

        .backup-item-btn:hover {
          background: var(--primary-color, #007bff);
          color: white;
          border-color: var(--primary-color, #007bff);
        }

        .backup-item-btn-danger:hover {
          background: #d32f2f;
        }

        .backup-empty {
          padding: 20px;
          text-align: center;
          color: #666;
          border: 2px dashed var(--border-color, #ddd);
          border-radius: 6px;
        }

        .dark-mode .backup-empty {
          color: #999;
          border-color: #444;
        }

        .spinner {
          display: inline-block;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <h2>Backup & Wiederherstellung</h2>

      {/* Export Section */}
      <div className="backup-section">
        <h3><Download className="backup-section-icon" /> Export</h3>
        <div className="backup-info">
          <Info size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'text-top' }} />
          Erstelle ein vollständiges Backup aller Templates, Snippets, Seiten, CSS-Dateien und Navigationen.
        </div>
        <div className="backup-buttons">
          <button className="backup-btn" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <>
                <RefreshCw size={16} className="spinner" /> Wird exportiert...
              </>
            ) : (
              <>
                <Download size={16} /> Backup Herunterladen
              </>
            )}
          </button>
          <button className="backup-btn" onClick={() => setShowSizeSettings(!showSizeSettings)}>
            ⚙️ Größenlimit
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
        <h3><Upload className="backup-section-icon" /> Import</h3>
        <div className="backup-info">
          Lade ein zuvor exportiertes Backup. Wähle die Restore-Strategie:
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
            <strong>WARNUNG:</strong> Die "Ersetzen"-Strategie wird alle bestehenden Templates, Snippets, Seiten, CSS-Dateien und Navigationen löschen!
          </div>
        )}

        <div className="file-input-wrapper">
          <button className="backup-btn" disabled={importing} onClick={openImportDialog} type="button">
            {importing ? (
              <>
                <RefreshCw size={16} className="spinner" /> Wird importiert...
              </>
            ) : (
              <>
                <Upload size={16} /> Backup-Datei auswählen
              </>
            )}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
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
            Keine Backups vorhanden. Erstelle das erste Backup mit dem Export-Button oben.
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
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
