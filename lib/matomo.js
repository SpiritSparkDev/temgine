// Baut den offiziellen Matomo-Tracking-Snippet aus den Settings
// (matomo_url, matomo_site_id, ...). Werte werden per JSON.stringify als
// String-Literale eingebettet, damit ein Anführungszeichen im Feld nicht
// aus dem generierten <script> ausbrechen kann.

function normalizeMatomoUrl(url) {
  const trimmed = String(url || '').trim();
  if (!/^https?:\/\//i.test(trimmed)) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function isValidMatomoConfig({ matomoUrl, siteId }) {
  return !!normalizeMatomoUrl(matomoUrl) && /^\d+$/.test(String(siteId || '').trim());
}

export function buildMatomoSnippet({ matomoUrl, siteId, trackWithoutCookies = false, respectDnt = false }) {
  const url = normalizeMatomoUrl(matomoUrl);
  const id = String(siteId || '').trim();
  if (!url || !/^\d+$/.test(id)) return '';

  const lines = [
    "var _paq = window._paq = window._paq || [];",
    trackWithoutCookies ? "_paq.push(['disableCookies']);" : null,
    respectDnt ? "_paq.push(['setDoNotTrack', true]);" : null,
    "_paq.push(['trackPageView']);",
    "_paq.push(['enableLinkTracking']);",
    "(function() {",
    `  var u = ${JSON.stringify(url)};`,
    `  _paq.push(['setTrackerUrl', u + 'matomo.php']);`,
    `  _paq.push(['setSiteId', ${JSON.stringify(id)}]);`,
    "  var d = document, g = d.createElement('script'), s = d.getElementsByTagName('script')[0];",
    `  g.async = true; g.src = u + 'matomo.js'; s.parentNode.insertBefore(g, s);`,
    "})();",
  ].filter(Boolean);

  return lines.join('\n');
}
