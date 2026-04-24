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
  setEditorDirty = () => {}
}) {
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
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
      
      {editingPage ? (
        <PageEditor 
          page={editingPage} 
          templates={templateList}
          allPages={pages}
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
                const pageUrl = `/${updatedPage.slug}`;
                let opened = false;
                try {
                  // window.open mit dem gleichen Namen kann existierende Fenster reuse
                  const safeName = `page_${updatedPage.slug.replace(/[^a-z0-9]/gi, '_')}`;
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
      ) : (
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
        />
      )}
    </div>
  );
}
