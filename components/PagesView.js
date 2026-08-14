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
  const [maintenanceTab, setMaintenanceTab] = useState('404');
  const [maintenanceContent, setMaintenanceContent] = useState({
    '404': { html: '', css: '', js: '' },
    '503': { html: '', css: '', js: '' },
    noHomepage: { html: '', css: '', js: '' },
    loading: { html: '', css: '', js: '' },
  });
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);
  const [maintenanceLoaded, setMaintenanceLoaded] = useState(false);

  const maintenanceTabs = [
    { id: '404', label: '404 Seite' },
    { id: '503', label: '503 Seite' },
    { id: 'noHomepage', label: 'Keine Startseite' },
    { id: 'loading', label: 'Ladebildschirm' },
  ];

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const loadMaintenancePages = async () => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const settings = await res.json();
      setMaintenanceContent({
        '404': {
          html: settings?.maintenance_404_html || '',
          css: settings?.maintenance_404_css || '',
          js: settings?.maintenance_404_js || '',
        },
        '503': {
          html: settings?.maintenance_503_html || '',
          css: settings?.maintenance_503_css || '',
          js: settings?.maintenance_503_js || '',
        },
        noHomepage: {
          html: settings?.maintenance_no_homepage_html || '',
          css: settings?.maintenance_no_homepage_css || '',
          js: settings?.maintenance_no_homepage_js || '',
        },
        loading: {
          html: settings?.maintenance_loading_html || '',
          css: settings?.maintenance_loading_css || '',
          js: settings?.maintenance_loading_js || '',
        },
      });
      setMaintenanceLoaded(true);
    } catch (e) {
      console.error('Error loading maintenance pages:', e);
    }
  };

  const updateMaintenanceField = (tabId, field, value) => {
    setMaintenanceContent(prev => ({
      ...prev,
      [tabId]: {
        ...(prev[tabId] || { html: '', css: '', js: '' }),
        [field]: value,
      },
    }));
  };

  const handleSaveMaintenance = async () => {
    setIsSavingMaintenance(true);
    const pairs = [
      ['maintenance_404_html', maintenanceContent['404']?.html || ''],
      ['maintenance_404_css', maintenanceContent['404']?.css || ''],
      ['maintenance_404_js', maintenanceContent['404']?.js || ''],
      ['maintenance_503_html', maintenanceContent['503']?.html || ''],
      ['maintenance_503_css', maintenanceContent['503']?.css || ''],
      ['maintenance_503_js', maintenanceContent['503']?.js || ''],
      ['maintenance_no_homepage_html', maintenanceContent.noHomepage?.html || ''],
      ['maintenance_no_homepage_css', maintenanceContent.noHomepage?.css || ''],
      ['maintenance_no_homepage_js', maintenanceContent.noHomepage?.js || ''],
      ['maintenance_loading_html', maintenanceContent.loading?.html || ''],
      ['maintenance_loading_css', maintenanceContent.loading?.css || ''],
      ['maintenance_loading_js', maintenanceContent.loading?.js || ''],
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

  const buildMaintenancePreviewDoc = (entry) => {
    const html = String(entry?.html || '').trim() || '<div style="padding:32px;text-align:center;color:#666;">Keine HTML-Inhalte hinterlegt</div>';
    const css = String(entry?.css || '');
    const js = String(entry?.js || '');

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; min-height: 100%; }
      body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
      ${css}
    </style>
  </head>
  <body>
    ${html}
    <script>
      try {
        ${js}
      } catch (e) {
        console.error('Maintenance preview JS error:', e);
      }
    </script>
  </body>
</html>`;
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
              Für jede Maintenance-Seite können HTML, CSS und JS separat gepflegt werden.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              {maintenanceTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setMaintenanceTab(tab.id)}
                  style={{
                    padding: '0.45rem 0.95rem',
                    borderRadius: '6px',
                    border: maintenanceTab === tab.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                    background: maintenanceTab === tab.id ? 'var(--accent-primary-soft, rgba(59,130,246,0.12))' : 'var(--bg-secondary)',
                    color: maintenanceTab === tab.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '1rem',
              alignItems: 'start',
            }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  HTML
                </label>
                <textarea
                  value={maintenanceContent[maintenanceTab]?.html || ''}
                  onChange={e => updateMaintenanceField(maintenanceTab, 'html', e.target.value)}
                  placeholder="<h1>Maintenance Inhalt</h1>"
                  rows={14}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                    minHeight: '280px',
                    resize: 'vertical',
                    fontFamily: 'monospace',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  CSS
                </label>
                <textarea
                  value={maintenanceContent[maintenanceTab]?.css || ''}
                  onChange={e => updateMaintenanceField(maintenanceTab, 'css', e.target.value)}
                  placeholder="body { font-family: sans-serif; }"
                  rows={14}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                    minHeight: '280px',
                    resize: 'vertical',
                    fontFamily: 'monospace',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  JS
                </label>
                <textarea
                  value={maintenanceContent[maintenanceTab]?.js || ''}
                  onChange={e => updateMaintenanceField(maintenanceTab, 'js', e.target.value)}
                  placeholder="console.log('Maintenance Screen');"
                  rows={14}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                    minHeight: '280px',
                    resize: 'vertical',
                    fontFamily: 'monospace',
                  }}
                />
              </div>
            </div>

            <div style={{
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '0.9rem',
              background: 'var(--bg-secondary)',
            }}>
              <div style={{ marginBottom: '0.6rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Vorschau ({maintenanceTabs.find(t => t.id === maintenanceTab)?.label || 'Maintenance'})
              </div>
              <iframe
                title={`maintenance-preview-${maintenanceTab}`}
                srcDoc={buildMaintenancePreviewDoc(maintenanceContent[maintenanceTab])}
                sandbox="allow-scripts"
                style={{
                  width: '100%',
                  minHeight: '380px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  background: '#fff',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Vorschau aller Maintenance-Seiten</div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '0.75rem',
              }}>
                {maintenanceTabs.map(tab => (
                  <div
                    key={`preview-${tab.id}`}
                    style={{
                      border: maintenanceTab === tab.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '0.5rem',
                      background: 'var(--bg-secondary)',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.4rem',
                    }}>
                      <strong style={{ color: 'var(--text-primary)', fontSize: '0.84rem' }}>{tab.label}</strong>
                      <button
                        onClick={() => setMaintenanceTab(tab.id)}
                        style={{
                          border: '1px solid var(--border-color)',
                          background: '#fff',
                          borderRadius: '6px',
                          padding: '0.2rem 0.45rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                        }}
                      >
                        Bearbeiten
                      </button>
                    </div>
                    <iframe
                      title={`maintenance-preview-card-${tab.id}`}
                      srcDoc={buildMaintenancePreviewDoc(maintenanceContent[tab.id])}
                      sandbox="allow-scripts"
                      style={{
                        width: '100%',
                        minHeight: '180px',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        background: '#fff',
                      }}
                    />
                  </div>
                ))}
              </div>
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
