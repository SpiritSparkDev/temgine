// Weiterleitungs-Konfiguration einer Seite lebt in page.data.redirect (keine
// eigene DB-Spalte) — siehe components/PageEditor.js (schreibt dieses Feld)
// und pages/[...slug].js / pages/index.js (lesen es für den echten Redirect).
//
// target: '_self' löst beim Seitenaufruf eine echte HTTP-Weiterleitung aus
// (getServerSideProps -> { redirect }), bevor überhaupt Blöcke gerendert
// werden. target: '_blank' kann das nicht automatisch ("neuer Tab" existiert
// auf Protokoll-Ebene nicht) — die Seite bleibt mit Status 200 erreichbar und
// zeigt stattdessen einen normalen, klickbaren Link zum Ziel (siehe
// buildRedirectLinkHtml), statt automatisch irgendwohin zu navigieren.

const URL_PATTERN = /^(\/[^\s]*|https?:\/\/[^\s]+)$/i;

// Liest + validiert page.data.redirect. Gibt null zurück, wenn keine
// Weiterleitung konfiguriert ist oder die URL ein unsicheres/ungültiges
// Schema hat (z. B. "javascript:").
export function getPageRedirect(page) {
  const r = page && page.data && page.data.redirect;
  if (!r || typeof r !== 'object') return null;
  const url = String(r.url || '').trim();
  if (!url || !URL_PATTERN.test(url)) return null;
  return {
    type: r.type === 'permanent' ? 'permanent' : 'temporary',
    url,
    target: r.target === '_blank' ? '_blank' : '_self',
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Rendert eine simple Seite mit einem klickbaren Link zum Weiterleitungsziel
// (target "_blank" — kein automatischer HTTP-Redirect möglich, siehe oben).
export function buildRedirectLinkHtml(title, url) {
  const safeTitle = escapeHtml(title);
  const safeUrl = escapeHtml(url);
  return `<div style="padding: 60px 24px; text-align: center;">
  ${safeTitle ? `<p style="margin: 0 0 16px; font-size: 1.1rem;">${safeTitle}</p>` : ''}
  <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 10px 22px; border: 1px solid currentColor; border-radius: 6px; text-decoration: none; color: inherit;">Zur Seite</a>
</div>`;
}

// sanitizeRecursive (lib/htmlSanitize.js) läuft über JEDEN String in page.data
// und escaped dabei u. a. "&" zu "&amp;" — für Rich-Text-Felder richtig, für
// eine Ziel-URL mit Query-String ("?a=1&b=2") aber eine stille Korruption.
// Daher wird redirect hier aus `data` herausgehalten, bevor sanitizeRecursive
// läuft, validiert, und danach wieder eingesetzt.
export function extractRedirectForSave(data) {
  const r = data && data.redirect;
  const rest = { ...(data || {}) };
  delete rest.redirect;
  const validated = getPageRedirect({ data: { redirect: r } });
  return { data: rest, redirect: validated };
}
