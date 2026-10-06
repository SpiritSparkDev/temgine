// Serverseitige SEO-Metadaten: liest Seiten- und Website-Einstellungen und
// baut daraus Title/Description/OG/Twitter/JSON-LD, damit Suchmaschinen- und
// Social-Media-Crawler (die kein JavaScript ausführen) echte Meta-Tags sehen
// — nicht nur das clientseitig nachgeladene Lade-Gerüst.
import { prisma } from './prisma';

export const SEO_SETTING_KEYS = [
  'seo_site_name',
  'seo_title_template',
  'seo_default_description',
  'seo_default_og_image',
  'seo_twitter_handle',
  'seo_organization_name',
  'seo_organization_logo',
  'seo_google_site_verification',
  'seo_bing_site_verification',
  'seo_indexing_enabled',
];

const FALLBACK_TITLE = 'Seite nicht gefunden';
const NOINDEX = 'noindex, nofollow';

export async function loadSeoSettings() {
  const rows = await prisma.setting.findMany({ where: { key: { in: SEO_SETTING_KEYS } } });
  const map = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export function resolveBaseUrl(req) {
  const headers = (req && req.headers) || {};
  const protocol = headers['x-forwarded-proto'] || 'https';
  const host = headers['x-forwarded-host'] || headers.host || 'localhost:3000';
  return `${protocol}://${host}`;
}

function absolutize(url, baseUrl) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${baseUrl}${value.startsWith('/') ? '' : '/'}${value}`;
}

function applyTitleTemplate(template, pageTitle, siteName) {
  const title = String(pageTitle || '').trim();
  if (!title) return siteName || FALLBACK_TITLE;
  const tmpl = String(template || '').trim();
  if (tmpl.includes('%s')) return tmpl.replace('%s', title);
  return siteName ? `${title} – ${siteName}` : title;
}

// JSON.stringify allein reicht nicht: ein Seitentitel mit "</script>" könnte
// sonst aus dem <script type="application/ld+json">-Tag ausbrechen.
export function escapeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function buildBreadcrumbJsonLd(routePath, baseUrl, currentTitle) {
  const segments = String(routePath || '').split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const items = [{ '@type': 'ListItem', position: 1, name: 'Start', item: baseUrl }];
  let acc = '';
  segments.forEach((seg, idx) => {
    acc += `/${seg}`;
    const isLast = idx === segments.length - 1;
    items.push({
      '@type': 'ListItem',
      position: idx + 2,
      name: isLast && currentTitle ? currentTitle : seg,
      item: `${baseUrl}${acc}`,
    });
  });
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items };
}

/**
 * Baut die vollständigen SEO-Metadaten für eine Seite.
 * Fallback-Kette pro Feld: Seiten-Override (page.data.seo.*) -> Website-Standard
 * (settings) -> generischer Fallback.
 */
export function buildPageMeta({ page, routePath, baseUrl, settings = {}, notFound = false }) {
  const siteName = settings.seo_site_name || '';
  const globalIndexingDisabled = settings.seo_indexing_enabled === 'false';
  const defaultDescription = settings.seo_default_description || '';
  const defaultOgImage = absolutize(settings.seo_default_og_image, baseUrl);

  if (notFound || !page) {
    return {
      title: applyTitleTemplate(settings.seo_title_template, FALLBACK_TITLE, siteName),
      description: defaultDescription,
      canonical: '',
      robots: NOINDEX,
      siteName,
      twitterHandle: settings.seo_twitter_handle || '',
      googleSiteVerification: settings.seo_google_site_verification || '',
      bingSiteVerification: settings.seo_bing_site_verification || '',
      og: { title: siteName || FALLBACK_TITLE, description: defaultDescription, image: defaultOgImage },
      jsonLd: [],
    };
  }

  const seo = (page.data && page.data.seo) || {};
  const isGated = Array.isArray(page.accessGroups) && page.accessGroups.length > 0;

  const rawTitle = seo.metaTitle || page.title || '';
  const title = applyTitleTemplate(settings.seo_title_template, rawTitle, siteName);
  const description = seo.metaDescription || defaultDescription;
  const canonical = absolutize(seo.canonicalUrl, baseUrl) || `${baseUrl}${routePath}`;

  let robots = seo.robots || 'index, follow';
  if (globalIndexingDisabled || isGated) robots = NOINDEX;

  const ogTitle = seo.ogTitle || rawTitle || title;
  const ogDescription = seo.ogDescription || description;
  const ogImage = absolutize(seo.ogImage, baseUrl) || defaultOgImage;

  const twitterTitle = seo.twitterTitle || ogTitle;
  const twitterDescription = seo.twitterDescription || ogDescription;
  const twitterImage = absolutize(seo.twitterImage, baseUrl) || ogImage;
  const twitterCard = seo.twitterCard || (twitterImage ? 'summary_large_image' : 'summary');

  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName || title,
    url: baseUrl,
  }];
  if (settings.seo_organization_name) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: settings.seo_organization_name,
      url: baseUrl,
      ...(settings.seo_organization_logo ? { logo: absolutize(settings.seo_organization_logo, baseUrl) } : {}),
    });
  }
  const breadcrumb = buildBreadcrumbJsonLd(routePath, baseUrl, rawTitle || title);
  if (breadcrumb) jsonLd.push(breadcrumb);

  return {
    title,
    description,
    canonical,
    robots,
    siteName,
    twitterHandle: settings.seo_twitter_handle || '',
    googleSiteVerification: settings.seo_google_site_verification || '',
    bingSiteVerification: settings.seo_bing_site_verification || '',
    og: { title: ogTitle, description: ogDescription, image: ogImage },
    twitter: { card: twitterCard, title: twitterTitle, description: twitterDescription, image: twitterImage },
    jsonLd,
  };
}

// Seitenbaum wie /api/pages: nur Top-Level-Seiten sind eigene DB-Zeilen,
// Unterseiten stecken rekursiv im children-JSON-Feld (siehe pages/api/pages.js).
export async function loadPageTreeForMeta() {
  return prisma.page.findMany({ where: { OR: [{ status: 'PUBLISHED' }, { isHomepage: true }] } });
}

// Identische Auflösung wie clientseitig in pages/[...slug].js (findPageByPath),
// damit Server-Meta und tatsächlich gerenderte Seite immer übereinstimmen.
export function findPageForRoute(pages, segments) {
  if (!segments || segments.length === 0) {
    return (pages || []).find((p) => p.isHomepage === true) || null;
  }
  let currentNodes = pages || [];
  let found = null;
  for (const s of segments) {
    found = currentNodes.find((n) => n.slug === s);
    if (!found) return null;
    currentNodes = found.children || [];
  }
  return found;
}

/**
 * Lädt Settings + Seitenbaum und baut die Meta-Daten für eine Route in
 * einem Rutsch — gedacht für getServerSideProps in pages/index.js und
 * pages/[...slug].js.
 */
export async function resolveSeoMetaForRoute(req, routePath, segments) {
  const [settings, pages] = await Promise.all([loadSeoSettings(), loadPageTreeForMeta()]);
  const baseUrl = resolveBaseUrl(req);
  const page = findPageForRoute(pages, segments);
  const meta = buildPageMeta({ page, routePath, baseUrl, settings, notFound: !page });
  return { meta, found: !!page, settings, baseUrl, page };
}

// Blog-Beiträge sind keine Page-Baum-Knoten (eigene Tabellen, Route
// /[channelSlug]/[postSlug] wird clientseitig gesondert aufgelöst, siehe
// pages/[...slug].js) — daher ein eigener Auflösungspfad, damit Beiträge
// nicht fälschlich als "nicht gefunden"/noindex behandelt werden.
export async function findBlogPostForRoute(channelSlug, postSlug) {
  const channel = await prisma.blogChannel.findUnique({ where: { slug: channelSlug } });
  if (!channel) return null;
  const post = await prisma.blogPost.findFirst({
    where: { channelId: channel.id, slug: postSlug, status: 'PUBLISHED' },
  });
  if (!post) return null;
  return { channel, post };
}

// post kommt roh aus Prisma (siehe findBlogPostForRoute) — Overrides liegen
// unter templateData.seo, genau wie bei Seiten unter page.data.seo (im
// BlogPostEditor über dieselbe SeoPanel-Komponente gepflegt).
export function buildBlogPostMeta({ post, routePath, baseUrl, settings = {} }) {
  const siteName = settings.seo_site_name || '';
  const globalIndexingDisabled = settings.seo_indexing_enabled === 'false';
  const defaultDescription = settings.seo_default_description || '';
  const defaultOgImage = absolutize(settings.seo_default_og_image, baseUrl);
  const seo = (post.templateData && typeof post.templateData === 'object' && post.templateData.seo) || {};

  const rawTitle = seo.metaTitle || post.title || '';
  const title = applyTitleTemplate(settings.seo_title_template, rawTitle, siteName);
  const description = seo.metaDescription || post.excerpt || defaultDescription;
  const canonical = absolutize(seo.canonicalUrl, baseUrl) || `${baseUrl}${routePath}`;

  let robots = seo.robots || 'index, follow';
  if (globalIndexingDisabled) robots = NOINDEX;

  const ogTitle = seo.ogTitle || rawTitle || title;
  const ogDescription = seo.ogDescription || description;
  const ogImage = absolutize(seo.ogImage, baseUrl) || absolutize(post.coverImage, baseUrl) || defaultOgImage;

  const twitterTitle = seo.twitterTitle || ogTitle;
  const twitterDescription = seo.twitterDescription || ogDescription;
  const twitterImage = absolutize(seo.twitterImage, baseUrl) || ogImage;
  const twitterCard = seo.twitterCard || (twitterImage ? 'summary_large_image' : 'summary');

  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    ...(description ? { description } : {}),
    ...(ogImage ? { image: ogImage } : {}),
    ...(post.author ? { author: { '@type': 'Person', name: post.author } } : {}),
    ...(post.publishedAt ? { datePublished: new Date(post.publishedAt).toISOString() } : {}),
    ...(post.updatedAt ? { dateModified: new Date(post.updatedAt).toISOString() } : {}),
    mainEntityOfPage: canonical,
  }];
  const breadcrumb = buildBreadcrumbJsonLd(routePath, baseUrl, rawTitle || title);
  if (breadcrumb) jsonLd.push(breadcrumb);

  return {
    title,
    description,
    canonical,
    robots,
    siteName,
    twitterHandle: settings.seo_twitter_handle || '',
    googleSiteVerification: settings.seo_google_site_verification || '',
    bingSiteVerification: settings.seo_bing_site_verification || '',
    og: { title: ogTitle, description: ogDescription, image: ogImage },
    twitter: { card: twitterCard, title: twitterTitle, description: twitterDescription, image: twitterImage },
    jsonLd,
  };
}
