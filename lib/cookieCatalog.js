export const COOKIE_CATALOG = [
  {
    id: 'google-analytics',
    name: 'Google Analytics',
    provider: 'Google LLC',
    category: 'statistics',
    detect: { js: [/gtag\(/i, /google-analytics\.com/i, /googletagmanager\.com\/gtag/i], iframeDomains: [] },
    cookies: [
      { name: '_ga', purpose: 'Unterscheidung von Website-Besuchern', duration: '2 Jahre' },
      { name: '_ga_*', purpose: 'Speichert Sitzungsstatus (GA4)', duration: '2 Jahre' },
      { name: '_gid', purpose: 'Unterscheidung von Website-Besuchern', duration: '24 Stunden' },
    ],
    privacyUrl: 'https://policies.google.com/privacy',
  },
  {
    id: 'google-tag-manager',
    name: 'Google Tag Manager',
    provider: 'Google LLC',
    category: 'statistics',
    detect: { js: [/googletagmanager\.com\/gtm\.js/i], iframeDomains: ['googletagmanager.com'] },
    cookies: [],
    privacyUrl: 'https://policies.google.com/privacy',
  },
  {
    id: 'meta-pixel',
    name: 'Meta (Facebook) Pixel',
    provider: 'Meta Platforms, Inc.',
    category: 'marketing',
    detect: { js: [/fbq\(/i, /connect\.facebook\.net/i], iframeDomains: [] },
    cookies: [
      { name: '_fbp', purpose: 'Liefert Werbung über Facebook-Produkte aus', duration: '3 Monate' },
    ],
    privacyUrl: 'https://www.facebook.com/privacy/policy/',
  },
  {
    id: 'youtube',
    name: 'YouTube-Video',
    provider: 'Google LLC',
    category: 'marketing',
    detect: { js: [], iframeDomains: ['youtube.com', 'youtube-nocookie.com'] },
    cookies: [
      { name: 'VISITOR_INFO1_LIVE', purpose: 'Misst Bandbreite für eingebettete YouTube-Videos', duration: '6 Monate' },
      { name: 'YSC', purpose: 'Speichert eindeutige ID zur Wiedergabe eingebetteter Videos', duration: 'Sitzung' },
    ],
    privacyUrl: 'https://policies.google.com/privacy',
  },
  {
    id: 'vimeo',
    name: 'Vimeo-Video',
    provider: 'Vimeo Inc.',
    category: 'marketing',
    detect: { js: [], iframeDomains: ['vimeo.com'] },
    cookies: [
      { name: 'vuid', purpose: 'Eindeutige Besucher-ID für den Vimeo-Player', duration: '2 Jahre' },
    ],
    privacyUrl: 'https://vimeo.com/privacy',
  },
  {
    id: 'google-maps',
    name: 'Google Maps',
    provider: 'Google LLC',
    category: 'functional',
    detect: { js: [/maps\.googleapis\.com/i], iframeDomains: ['google.com/maps', 'maps.google.com'] },
    cookies: [
      { name: 'NID', purpose: 'Speichert Einstellungen für Google-Karten', duration: '6 Monate' },
    ],
    privacyUrl: 'https://policies.google.com/privacy',
  },
  {
    id: 'matomo',
    name: 'Matomo',
    provider: 'Selbst gehostet',
    category: 'statistics',
    detect: { js: [/matomo\.js/i, /_paq\.push/i], iframeDomains: [] },
    cookies: [
      { name: '_pk_id', purpose: 'Unterscheidung von Website-Besuchern', duration: '13 Monate' },
    ],
    privacyUrl: '',
  },
  {
    id: 'hotjar',
    name: 'Hotjar',
    provider: 'Hotjar Ltd.',
    category: 'statistics',
    detect: { js: [/static\.hotjar\.com/i, /hjSetting/i], iframeDomains: [] },
    cookies: [
      { name: '_hjSessionUser_*', purpose: 'Hotjar-Nutzer-ID über Sitzungen hinweg', duration: '1 Jahr' },
    ],
    privacyUrl: 'https://www.hotjar.com/legal/policies/privacy/',
  },
  {
    id: 'linkedin-insight',
    name: 'LinkedIn Insight Tag',
    provider: 'LinkedIn Corporation',
    category: 'marketing',
    detect: { js: [/snap\.licdn\.com/i, /_linkedin_partner_id/i], iframeDomains: [] },
    cookies: [
      { name: 'li_sugr', purpose: 'Geräteerkennung über mehrere Geräte hinweg', duration: '3 Monate' },
    ],
    privacyUrl: 'https://www.linkedin.com/legal/privacy-policy',
  },
];

export const NECESSARY_BASELINE = [
  {
    id: 'temgine-session',
    name: 'Login-Session',
    provider: 'Diese Website',
    category: 'necessary',
    cookies: [{ name: 'next-auth.session-token', purpose: 'Hält den Admin-Login-Status aufrecht', duration: 'Sitzung' }],
  },
  {
    id: 'temgine-consent',
    name: 'Cookie-Einwilligung',
    provider: 'Diese Website',
    category: 'necessary',
    cookies: [{ name: 'temgine_consent', purpose: 'Speichert die getroffene Cookie-Auswahl', duration: '1 Jahr' }],
  },
];

export function extractHostname(src) {
  try {
    const str = String(src);
    if (!str.includes('://')) return '';
    return new URL(str).hostname.toLowerCase();
  } catch (_e) {
    return '';
  }
}

export function findCatalogServicesForJs(text) {
  const value = String(text || '');
  return COOKIE_CATALOG.filter((service) => (service.detect.js || []).some((re) => re.test(value)));
}

export function findCatalogServiceForIframe(src) {
  const lower = String(src || '').toLowerCase();
  const hostname = extractHostname(src);
  return COOKIE_CATALOG.find((service) =>
    (service.detect.iframeDomains || []).some((pattern) => {
      const p = pattern.toLowerCase();
      if (p.includes('/')) return lower.includes(p);
      return hostname === p || hostname.endsWith(`.${p}`);
    })
  ) || null;
}
