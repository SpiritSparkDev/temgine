// Client-Hooks des Picgine-Plugins (landet im Browser-Bundle: nichts mit Secrets, Prisma oder fs).
// Section-Provider {{#picgine:name}} / {{#picgine:name=slug}}, Hydration (Entsperren, Logout,
// Passwort-Reset) und Einstellungs-Panel. Server-Seite: server.js.
import React from 'react';
import GallerySelect from './components/GallerySelect';
import PicginePanel from './components/PicginePanel';
import { toPicgineContext } from './lib/context';
import { loadPicgineContents, readPicgineParam, hydratePicgine } from './lib/runtime';

const subSlug = (query) => readPicgineParam(new URLSearchParams(query || {}).toString());

export default {
  sections: {
    picgine: {
      editorType: 'gallery',
      editorFieldLabel: 'Picgine-Galerie',
      EditorField: ({ value, onChange, fieldLabel }) => (
        <GallerySelect value={value} onChange={onChange} label={`Picgine-Galerie für ${fieldLabel}`} />
      ),
      // Mit ?picgine=<slug> wird je Galerie, die den Unterordner enthält, dieser geladen (Wurzel-Slug → Daten).
      loadClient: (slugs, { query } = {}) => loadPicgineContents(slugs, subSlug(query)),
      toContext: (data, { value, basePath } = {}) => toPicgineContext(data, String(value || ''), basePath || ''),
      // Gesperrte Galerie (Viewer-Token im Cookie) und Unterordner gibt es nicht im Snapshot.
      requiresDynamic: ({ html, query }) => html.includes('data-picgine-unlock') || !!subSlug(query),
    },
  },
  hydrate: (container, { rerender }) => hydratePicgine(container, rerender),
  SettingsPanel: PicginePanel,
};
