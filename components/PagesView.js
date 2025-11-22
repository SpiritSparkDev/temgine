import React, { useState } from 'react';
import PageTreeEditor from './PageTreeEditor';
import PageEditor from './PageEditor';
import Toast from './Toast';

export default function PagesView({ 
  pages, 
  templateList, 
  editingPage, 
  setEditingPage, 
  handleUpdatePages 
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
          onSave={async (updatedPage, options = {}) => {
            try {
              const updatePageInTree = (nodes) => 
                nodes.map(n => 
                  n.id === updatedPage.id 
                    ? { ...n, ...updatedPage }
                    : { ...n, children: updatePageInTree(n.children || []) }
                );
              const updated = updatePageInTree(pages);
              await handleUpdatePages(updated);
              showToast('Seite erfolgreich gespeichert!', 'success');
              
              // Verarbeite Optionen
              if (options.close) {
                // Schließe Editor
                setEditingPage(null);
              } else if (options.view) {
                // Öffne Seite in neuem Tab
                window.open(`/${updatedPage.slug}`, '_blank');
                // Aktualisiere Daten
                setEditingPage(updatedPage);
              } else {
                // Normal: Seite NICHT verlassen, nur Daten aktualisieren
                setEditingPage(updatedPage);
              }
            } catch (error) {
              showToast('Fehler beim Speichern: ' + error.message, 'error');
            }
          }}
          onCancel={() => setEditingPage(null)}
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
