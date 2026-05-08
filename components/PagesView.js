import React, { useState } from 'react';
import PageTreeEditor from './PageTreeEditor';
import PageEditor from './PageEditor';
import Toast from './Toast';

export default function PagesView({ 
  pages, 
  templateList, 
  editingPage, 
  setEditingPage, 
  handleUpdatePages,
  editorDirty = false,
  setEditorDirty = () => {},
  userRole,
  onRefreshPages,
}) {
  const [toast, setToast] = useState(null);
  const [pagesTab, setPagesTab] = useState('pages'); // 'pages' or 'maintenance'
  const [maintenance404Html, setMaintenance404Html] = useState('');
  const [maintenance503Html, setMaintenance503Html] = useState('');
  const [maintenanceNoHomepageHtml, setMaintenanceNoHomepageHtml] = useState('');
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);
  const [maintenanceLoaded, setMaintenanceLoaded] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const loadMaintenancePages = async () => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const settings = await res.json();
      setMaintenance404Html(settings?.maintenance_404_html || '');
      setMaintenance503Html(settings?.maintenance_503_html || '');
      setMaintenanceNoHomepageHtml(settings?.maintenance_no_homepage_html || '');
      setMaintenanceLoaded(true);
    } catch (e) {
      console.error('Error loading maintenance pages:', e);
    }
  };

  const handleSaveMaintenance = async () => {
    setIsSavingMaintenance(true);
    const pairs = [
      ['maintenance_404_html', maintenance404Html],
      ['maintenance_503_html', maintenance503Html],
      ['maintenance_no_homepage_html', maintenanceNoHomepageHtml],
    ];

    try {
      for (const [key, value] of pairs) {
        const r = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
        if (!r.ok) throw new Error((await r.json()).error || 'Fehler');
      }
      showToast('Maintenance-Seiten gespeichert', 'success');
    } catch (e) {
      showToast('Fehler beim Speichern: ' + e.message, 'error');
    } finally {
      setIsSavingMaintenance(false);
    }
  };

  return (
    <div className="admin-editor-area">
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '2px solid var(--border-color)', paddingLeft: '1rem', marginBottom: '1rem' }}>
        <button 
          style={{
            padding: '0.5rem 1.25rem',
            border: 'none',
            borderBottom: pagesTab === 'pages' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            background: 'transparent',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
            color: pagesTab === 'pages' ? 'var(--accent-primary)' : 'var(--text-secondary)',
            marginBottom: '-2px',
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onClick={() => setPagesTab('pages')}
        >
          Seiten
        </button>
        <button 
          style={{
            padding: '0.5rem 1.25rem',
            border: 'none',
            borderBottom: pagesTab === 'maintenance' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            background: 'transparent',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
            color: pagesTab === 'maintenance' ? 'var(--accent-primary)' : 'var(--text-secondary)',
            marginBottom: '-2px',
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onClick={() => {
            setPagesTab('maintenance');
            if (!maintenanceLoaded) loadMaintenancePages();
          }}
        >
          Maintenance Seiten
        </button>
      </div>
      
      {pagesTab === 'pages' && editingPage ? (
        <PageEditor 
          page={editingPage} 
          templates={templateList}
          allPages={pages}
          userRole={userRole}
          onSave={async (updatedPage, options) => {
            try {
              // Ensure options is an object
              const opts = options || {};
              const isSilent = opts.silent === true;
              
              const updatePageInTree = (nodes) => 
                nodes.map(n => 
                  n.id === updatedPage.id 
                    ? { ...n, ...updatedPage }
                    : { ...n, children: updatePageInTree(n.children || []) }
                );
              const updated = updatePageInTree(pages);
              const saved = await handleUpdatePages(updated);
              
              if (!saved) {
                // Fehler wurde bereits durch handleUpdatePages angezeigt
                return false;
              }

              setEditorDirty(false);
              
              if (!isSilent) {
                showToast('Seite erfolgreich gespeichert!', 'success');
              }
              
              // Verarbeite Optionen - nur wenn explizit gesetzt
              if (!isSilent && opts.close === true) {
                // Schließe Editor und kehre zur Seitenverwaltung zurück
                setEditingPage(null);
              } else if (!isSilent && opts.view === true) {
                // Versuche, die Seite in einem bestehenden Tab zu fokussieren oder öffne einen neuen
                const findPagePathById = (nodes, targetId, parentPath = '') => {
                  for (const node of nodes || []) {
                    const currentPath = parentPath ? `${parentPath}/${node.slug}` : node.slug;
                    if (node.id === targetId) return currentPath;
                    const nested = findPagePathById(node.children || [], targetId, currentPath);
                    if (nested) return nested;
                  }
                  return '';
                };

                const fullPath = findPagePathById(updated, updatedPage.id);
                const pageUrl = `/${fullPath || updatedPage.slug}`;
                let opened = false;
                try {
                  // window.open mit dem gleichen Namen kann existierende Fenster reuse
                  const safeName = `page_${(fullPath || updatedPage.slug).replace(/[^a-z0-9]/gi, '_')}`;
                  const newWindow = window.open(pageUrl, safeName);
                  if (newWindow) {
                    // Erzwinge ein Reload, um sicherzustellen, dass die neue Version angezeigt wird
                    setTimeout(() => {
                      newWindow.location.reload();
                    }, 100);
                    opened = true;
                  }
                } catch (e) {
                  console.warn('Fehler beim Öffnen des Tabs:', e);
                }
                if (!opened) {
                  // Fallback: öffne neuen Tab
                  window.open(pageUrl, '_blank');
                }
                // Aktualisiere Daten im Editor (aber bleibe im Editor)
                setEditingPage(updatedPage);
              } else {
                // Normal (oder wenn options nicht gesetzt): Speichern nur, Editor bleibt offen mit aktualisierten Daten
                setEditingPage(updatedPage);
              }
              return true;
            } catch (error) {
              if (!(options && options.silent === true)) {
                showToast('Speichern fehlgeschlagen. Bitte Eingaben pruefen und erneut speichern. Details: ' + error.message, 'error');
              }
              return false;
            }
          }}
          onDirtyChange={setEditorDirty}
          onCancel={() => {
            if (editorDirty) {
              const confirmed = window.confirm('Du hast ungespeicherte Aenderungen. Wirklich ohne Speichern schliessen?');
              if (!confirmed) return;
            }
            setEditorDirty(false);
            setEditingPage(null);
          }}
        />
      ) : pagesTab === 'pages' ? (
        <PageTreeEditor 
          pages={pages} 
          onSelect={(id) => {
            const findPage = (nodes, targetId) => {
              for (const node of nodes) {
                if (node.id === targetId) return node;
                const found = findPage(node.children || [], targetId);
                if (found) return found;
              }
              return null;
            };
            const page = findPage(pages, id);
            if (page) setEditingPage(page);
          }} 
          onUpdate={handleUpdatePages}
          userRole={userRole}
          onRefreshPages={onRefreshPages}
        />
      ) : (
        <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
          <h2 style={{ marginBottom: '1.5rem' }}>Maintenance Seiten</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              HTML-Inhalte für Fallback-Seiten. Diese Inhalte werden direkt gerendert.
            </p>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                404 Seite (Nicht gefunden)
              </label>
              <textarea
                value={maintenance404Html}
                onChange={e => setMaintenance404Html(e.target.value)}
                placeholder="<h1>Seite nicht gefunden</h1>"
                rows={8}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                  minHeight: '180px',
                  resize: 'vertical',
                  fontFamily: 'monospace',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                503 Seite (Service nicht verfügbar)
              </label>
              <textarea
                value={maintenance503Html}
                onChange={e => setMaintenance503Html(e.target.value)}
                placeholder="<h1>Wartungsarbeiten</h1>"
                rows={8}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                  minHeight: '180px',
                  resize: 'vertical',
                  fontFamily: 'monospace',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Keine Startseite gefunden
              </label>
              <textarea
                value={maintenanceNoHomepageHtml}
                onChange={e => setMaintenanceNoHomepageHtml(e.target.value)}
                placeholder="<h1>Keine Startseite gefunden</h1>"
                rows={8}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                  minHeight: '180px',
                  resize: 'vertical',
                  fontFamily: 'monospace',
                }}
              />
            </div>

            <div>
              <button
                onClick={handleSaveMaintenance}
                disabled={isSavingMaintenance}
                style={{
                  padding: '0.6rem 1.5rem',
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: isSavingMaintenance ? 'not-allowed' : 'pointer',
                  opacity: isSavingMaintenance ? 0.6 : 1,
                }}
              >
                {isSavingMaintenance ? 'Speichern…' : 'Maintenance Seiten speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
