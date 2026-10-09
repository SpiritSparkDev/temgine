/**
 * lib/sections/picgine.js — Section-Provider {{#picgine:name}} / {{#picgine:name=slug}}.
 *
 * Noch im Kern (Plugin-System P2); P3 verschiebt die Datei nach plugins/picgine/client.js.
 * Server-Laden: lib/sections/picgine.server.js. Hydration (Entsperren/Logout): lib/picgineRuntime.js.
 */
import React from 'react';
import PicgineGallerySelect from '../../components/PicgineGallerySelect';
import { loadPicgineContents, readPicgineParam } from '../picgineRuntime';

const subSlug = (query) => readPicgineParam(new URLSearchParams(query || {}).toString());

// Picgine-Antwort (GET /api/v1/galleries/:slug) → Template-Kontext (TEMGINE-INTEGRATION §3).
// Alle Felder (auch allowDownload, zip, images[].download, parentSlug) werden durchgereicht.
// Unterordner-Navigation (SPEC §11.9): `data` kann ein Unterordner der im Block gewählten
// Galerie `rootSlug` sein; Links zeigen auf `basePath?picgine=<slug>` (Wurzel: `basePath`),
// breadcrumb/parentUrl bleiben im gewählten Teilbaum.
export function toPicgineContext(data, rootSlug = data?.slug, basePath = '') {
  if (!data || typeof data !== 'object') return null;
  const locked = !!data.locked;
  const url = (slug) => (slug === rootSlug ? (basePath || '?') : `${basePath}?picgine=${encodeURIComponent(slug)}`);
  const isRoot = data.slug === rootSlug;
  const crumbs = Array.isArray(data.breadcrumb) ? data.breadcrumb : [];
  const rootIndex = crumbs.findIndex((c) => c?.slug === rootSlug);
  return {
    ...data,
    breadcrumb: isRoot || rootIndex < 0 ? [] : crumbs.slice(rootIndex).map((c) => ({ ...c, url: url(c.slug) })),
    parentUrl: isRoot || !data.parentSlug ? null : url(data.parentSlug),
    locked,
    lockPassword: locked && data.lockMode === 'password',
    lockLogin: locked && data.lockMode === 'users',
    loggedIn: !!data.loggedIn,
    cover: locked ? null : (data.cover || null),
    images: locked || !Array.isArray(data.images) ? [] : data.images.map((img, i) => ({ ...img, index: i + 1 })),
    children: Array.isArray(data.children) ? data.children.map((c) => ({ ...c, url: url(c.slug) })) : [],
  };
}

export default {
  editorType: 'gallery',
  editorFieldLabel: 'Picgine-Galerie',
  EditorField: ({ value, onChange, fieldLabel }) => (
    <PicgineGallerySelect value={value} onChange={onChange} label={`Picgine-Galerie für ${fieldLabel}`} />
  ),
  // Mit ?picgine=<slug> wird je Galerie, die den Unterordner enthält, dieser geladen (Wurzel-Slug → Daten).
  loadClient: (slugs, { query } = {}) => loadPicgineContents(slugs, subSlug(query)),
  toContext: (data, { value, basePath } = {}) => toPicgineContext(data, String(value || ''), basePath || ''),
  // Gesperrte Galerie (Viewer-Token im Cookie) und Unterordner gibt es nicht im Snapshot.
  requiresDynamic: ({ html, query }) => html.includes('data-picgine-unlock') || !!subSlug(query),
};
