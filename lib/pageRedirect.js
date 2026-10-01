// Weiterleitungs-Konfiguration einer Seite lebt in page.data.redirect (keine
// eigene DB-Spalte) — siehe components/PageEditor.js (schreibt dieses Feld)
// und pages/[...slug].js / pages/index.js (lesen es für den echten Redirect).
//
// target: '_self' löst beim Seitenaufruf eine echte HTTP-Weiterleitung aus
// (getServerSideProps -> { redirect }), bevor überhaupt Blöcke gerendert
// werden. target: '_blank' kann das nicht ("neuer Tab" existiert auf
// Protokoll-Ebene nicht) und wird daher nur clientseitig per window.open
// umgesetzt — die Seite bleibt dabei mit Status 200 normal erreichbar.

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
