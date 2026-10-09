/**
 * lib/sections/picgine.server.js — serverseitiges Laden für {{#picgine:…}} (Live-Snapshot).
 * Ohne Viewer-Token: öffentliche Galerien landen fertig im Snapshot, geschützte als "locked"
 * (die Seite rendert sie dann clientseitig, siehe requiresDynamic in lib/sections/picgine.js).
 * Ein Fehler lässt nur die betroffene Galerie leer. P3 verschiebt die Datei nach plugins/picgine/.
 */
import { picgineFetch, isValidSlug } from '../picgine';

export default {
  loadServer: async (slugs) => {
    const out = {};
    for (const slug of slugs.filter(isValidSlug)) {
      const data = await picgineFetch(`/api/v1/galleries/${slug}`).catch((e) => {
        console.warn('[liveSnapshot] Picgine-Galerie nicht geladen', { slug, error: e.message });
        return null;
      });
      if (data) out[slug] = data;
    }
    return out;
  },
};
