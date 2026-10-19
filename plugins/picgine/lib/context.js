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
