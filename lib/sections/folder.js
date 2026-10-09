/**
 * lib/sections/folder.js — eingebauter Section-Provider {{#folder:name}} / {{#folder}}.
 *
 * block.props[name] hält den gewählten Upload-Ordner (relativ zu public/uploads/); die Section
 * iteriert über dessen Dateien (name, slug, url, path, ext, size, modified, isImage — siehe
 * lib/uploadFolder.js). Server-Laden: lib/sections/server.js (listFolderItemsRecursive).
 */
import React from 'react';

function FolderField({ value, onChange, fieldLabel, editor }) {
  return (
    <div className="field-url-row">
      <input
        type="text"
        readOnly
        placeholder="Kein Ordner gewählt"
        value={value ? `uploads/${value}` : ''}
        className="input-field-small field-input-full"
      />
      <button
        type="button"
        onClick={() => editor?.pickFolder?.(onChange)}
        className="btn-modern-small"
        title={`Ordner für ${fieldLabel} auswählen`}
        aria-label={`Ordner für ${fieldLabel} auswählen`}
      >📁 Ordner</button>
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="btn-modern-small hollow"
          title={`Ordner für ${fieldLabel} zurücksetzen`}
          aria-label={`Ordner für ${fieldLabel} zurücksetzen`}
        >Leeren</button>
      )}
    </div>
  );
}

export default {
  // Lokale Upload-Dateinamen (vom Admin hochgeladen): laufen wie vor P2 durch die normale
  // Markdown-/HTML-Verarbeitung der Block-Daten, statt als fremde Daten erzwungen escaped zu werden.
  trusted: true,
  editorType: 'folder',
  EditorField: FolderField,
  loadClient: async (paths) => {
    const out = {};
    await Promise.all(paths.map(async (folderPath) => {
      const res = await fetch(`/api/files?folder=${encodeURIComponent(folderPath)}&recursive=1&_t=${Date.now()}`);
      if (res.ok) out[folderPath] = (await res.json()).files || [];
    }));
    return out;
  },
  // Kein/unbekannter Ordner → keine Einträge (nie implizit das ganze Upload-Verzeichnis).
  toContext: (data) => data || [],
};
